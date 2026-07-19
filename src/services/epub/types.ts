export interface BookMetadata {
    title: string;
    author: string;
    description?: string;
    publisher?: string;
    language?: string;
    subjects?: string;
    pub_date?: string;
    cover?: Blob | null;
    images?: Map<string, Blob>;
    isbn?: string;
    physical_isbn?: string;
    ebook_isbn?: string;
}

export interface Section {
    title: string;
    content: string;
    level: 'h1' | 'h2' | 'break';
    parentIdx: number;
    childIndices: number[];
    hiddenFromToc?: boolean;
}
