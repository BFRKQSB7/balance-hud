export interface FirstLinePart {
    key: "model" | "project" | "advisor" | "sessionName" | "version" | "extra" | "duration" | "cost" | "speed" | null;
    text: string;
}
export declare function orderFirstLineParts(parts: FirstLinePart[], order: readonly string[]): string[];
//# sourceMappingURL=first-line-order.d.ts.map
