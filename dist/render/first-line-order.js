export function orderFirstLineParts(parts, order) {
    const keyedSlots = [];
    const byKey = new Map();
    parts.forEach((part, index) => {
        if (part.key === null) {
            return;
        }
        keyedSlots.push(index);
        const texts = byKey.get(part.key);
        if (texts) {
            texts.push(part.text);
        }
        else {
            byKey.set(part.key, [part.text]);
        }
    });
    const reordered = [];
    for (const key of order) {
        const texts = byKey.get(key);
        if (texts) {
            reordered.push(...texts);
            byKey.delete(key);
        }
    }
    for (const texts of byKey.values()) {
        reordered.push(...texts);
    }
    const result = parts.map((part) => part.text);
    keyedSlots.forEach((slot, index) => {
        result[slot] = reordered[index];
    });
    return result;
}
//# sourceMappingURL=first-line-order.js.map
