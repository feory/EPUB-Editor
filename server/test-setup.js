// Corre antes de qualquer teste (bunfig.toml): a base de dados dos testes é em memória, nunca o ebooks.db real.
// Tem de ser aqui — database.js abre a base ao ser importado e o módulo é partilhado por todos os testes do processo.
process.env.EPUB_DB = ':memory:';
process.env.JWT_SECRET ??= 'test-secret';
