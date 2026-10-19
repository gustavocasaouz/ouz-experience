export type Queryable = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };
export function cleanHtml(html: string): string;
export function validateManual(m: unknown): void;
export function importManual(db: Queryable, m: unknown): Promise<{ id: string; sections: number; warranty: number; maintenance: number; attachments: number }>;
export function searchText(title: string, html: string): string;
