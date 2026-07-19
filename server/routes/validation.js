import { existsSync, mkdirSync, rmSync, unlinkSync } from 'fs';
import { join } from 'path';
import { corsHeaders, jsonResponse } from '../response.js';
import { DATA_DIR, EPUBCHECK_JAR, TEMP_DIR } from '../config.js';

export async function validate(req) {
  const formData = await req.formData();
  const epubFile = formData.get('epub');
  if (!epubFile) return Response.json({ error: "No file" }, { status: 400, headers: corsHeaders });

  const tempPath = join(TEMP_DIR, `val_${Date.now()}_${Math.random().toString(36).slice(2)}.epub`);

  try {
    if (!existsSync(EPUBCHECK_JAR)) {
      console.error('[EPUBCheck] JAR não encontrado em:', EPUBCHECK_JAR);
      return jsonResponse({
        valid: true, errors: [],
        warnings: [{ message: "EPUBCheck não encontrado. Validação ignorada." }],
        summary: "Validação ignorada (ferramenta ausente).",
        timestamp: new Date().toISOString(),
      }, req, corsHeaders);
    }

    await Bun.write(tempPath, epubFile);
    console.log('[EPUBCheck] Validando EPUB 3.3:', tempPath);

    const proc = Bun.spawn(["java", "-jar", EPUBCHECK_JAR, tempPath], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
    ]);
    await proc.exited;

    const text = stdout + stderr;
    console.log('[EPUBCheck] Output:', text.substring(0, 500));

    const errors = [], warnings = [];
    text.split('\n').forEach(l => {
      const line = l.trim();
      if (line.startsWith('ERROR') || line.includes('ERROR('))
        errors.push({ message: line.replace(/^ERROR[:\s]*/, '').trim() });
      else if (line.startsWith('WARNING') || line.includes('WARNING('))
        warnings.push({ message: line.replace(/^WARNING[:\s]*/, '').trim() });
      else if (line.includes('FATAL'))
        errors.push({ message: line.replace(/^FATAL[:\s]*/, '').trim() });
    });

    const isValid = errors.length === 0;
    console.log(`[EPUBCheck] ${isValid ? 'VÁLIDO' : 'INVÁLIDO'} - ${errors.length} erros, ${warnings.length} avisos`);

    return jsonResponse({
      valid: isValid, errors, warnings,
      summary: isValid ? "EPUB 3.3 conforme e válido." : "EPUB não conforme com EPUB 3.3 - erros detectados.",
      timestamp: new Date().toISOString(),
    }, req, corsHeaders);
  } catch (err) {
    console.error('[EPUBCheck] Erro durante validação:', err);
    if (err.message.includes("Executable not found") || err.message.includes("ENOENT")) {
      return jsonResponse({
        valid: true, errors: [],
        warnings: [{ message: "Java não encontrado. Instale Java para validação EPUB." }],
        summary: "Validação ignorada (Java ausente).",
        timestamp: new Date().toISOString(),
      }, req, corsHeaders);
    }
    return Response.json({ error: "EpubCheck failed", details: err.message }, { status: 500, headers: corsHeaders });
  } finally {
    try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch {}
  }
}

export async function validateAccessibility(req, isbn) {
  const formData = await req.formData();
  const epubFile = formData.get('epub');
  if (!epubFile) return Response.json({ error: "No file" }, { status: 400, headers: corsHeaders });

  const tempPath = join(TEMP_DIR, `ace_${Date.now()}_${Math.random().toString(36).slice(2)}.epub`);
  const aceReportsDir = join(DATA_DIR, isbn, 'ace-reports');
  if (!existsSync(aceReportsDir)) mkdirSync(aceReportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = join(aceReportsDir, `report_${timestamp}`);

  try {
    await Bun.write(tempPath, epubFile);
    console.log('[Ace] Validando acessibilidade:', tempPath);
    console.log('[Ace] Relatório será guardado em:', outputDir);

    const proc = Bun.spawn(["ace", "-o", outputDir, tempPath, "--silent"], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      Bun.readableStreamToText(proc.stdout),
      Bun.readableStreamToText(proc.stderr),
    ]);
    await proc.exited;

    const reportPath = join(outputDir, 'report.json');
    if (!existsSync(reportPath)) {
      console.error('[Ace] Relatório não foi gerado');
      return jsonResponse({
        valid: false,
        errors: [{ message: "Ace não conseguiu gerar relatório. " + (stderr || stdout) }],
        warnings: [], summary: "Erro na validação de acessibilidade.",
        timestamp: new Date().toISOString(),
      }, req, corsHeaders);
    }

    const report = await Bun.file(reportPath).json();
    console.log('[Ace] Total de assertions:', report.assertions?.length || 0);

    const errors = [], warnings = [];

    if (Array.isArray(report.assertions)) {
      let failedAssertions = 0, totalIssues = 0;
      for (const assertion of report.assertions) {
        const outcome = assertion['earl:result']?.['earl:outcome'];
        if (outcome !== 'fail' && outcome !== 'cantTell') continue;
        failedAssertions++;
        for (const issue of (assertion.assertions || [])) {
          totalIssues++;
          const test = issue['earl:test'] || {};
          const result = issue['earl:result'] || {};
          const impact = test['earl:impact'] || 'moderate';
          const pointer = result['earl:pointer'] || result.pointer || {};
          const relatedNodes = issue.relatedNodes || [];
          const html = pointer.html || issue.html || result.html || relatedNodes[0]?.html || '';
          const problemData = {
            rule: test['dct:title'] || 'Unknown issue',
            description: result['dct:description'] || test['dct:description'] || 'No description',
            message: result['dct:description'] || test['dct:description'] || 'No description',
            impact: outcome === 'cantTell' ? 'best-practice' : impact,
            file: assertion['earl:testSubject']?.url || 'unknown file',
            outcome,
            location: pointer.cfi || pointer.css || pointer.xpath || pointer['#text'] || (issue.target?.join(' > ') ?? null),
            html: html || null,
            context: pointer.context || issue.context || null,
            target: issue.target || null,
          };
          if (outcome === 'cantTell' || (impact !== 'critical' && impact !== 'serious'))
            warnings.push(problemData);
          else
            errors.push(problemData);
        }
      }
      console.log('[Ace] Assertions falhadas:', failedAssertions, '| Problemas:', totalIssues);
    }

    const certificationMetadata = ['a11y:certifiedBy', 'a11y:certifierCredential', 'a11y:certifierReport'];
    const relevantMissing = ((report['a11y-metadata'] || {}).missing || []).filter(m => !certificationMetadata.includes(m));
    if (relevantMissing.length > 0) {
      warnings.push({
        message: `Metadados de acessibilidade ausentes: ${relevantMissing.join(', ')}`,
        description: `Metadados de acessibilidade ausentes: ${relevantMissing.join(', ')}`,
        impact: 'moderate', file: 'Package Document', rule: 'accessibility-metadata',
      });
    }

    const isValid = errors.length === 0;
    const totalIssues = errors.length + warnings.length;
    console.log(`[Ace] ${isValid ? 'ACESSÍVEL' : 'COM PROBLEMAS'} - ${errors.length} erros, ${warnings.length} avisos`);

    return jsonResponse({
      valid: isValid, errors, warnings,
      summary: isValid ? "EPUB acessível conforme WCAG." : `${totalIssues} problema(s) de acessibilidade encontrado(s).`,
      timestamp: new Date().toISOString(),
      aceVersion: report['@context'] || 'unknown',
    }, req, corsHeaders);
  } catch (err) {
    console.error('[Ace] Erro durante validação:', err);
    if (err.message.includes("Executable not found") || err.message.includes("ENOENT")) {
      return jsonResponse({
        valid: true, errors: [],
        warnings: [{ message: "Ace não encontrado. Instale @daisy/ace para validação de acessibilidade." }],
        summary: "Validação de acessibilidade ignorada (ferramenta ausente).",
        timestamp: new Date().toISOString(),
      }, req, corsHeaders);
    }
    return Response.json({ error: "Ace failed", details: err.message }, { status: 500, headers: corsHeaders });
  } finally {
    try {
      if (existsSync(tempPath)) { unlinkSync(tempPath); console.log('[Ace] EPUB temporário removido'); }
      if (existsSync(outputDir)) { rmSync(outputDir, { recursive: true, force: true }); console.log('[Ace] Relatório removido'); }
    } catch (cleanupErr) {
      console.error('[Ace] Erro ao limpar:', cleanupErr);
    }
  }
}
