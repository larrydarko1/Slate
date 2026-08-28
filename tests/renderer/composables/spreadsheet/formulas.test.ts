import { describe, it, expect, beforeEach } from 'vitest';
import { useSpreadsheet, type SpreadsheetState } from '@/renderer/composables/useSpreadsheet';

describe('formulas', () => {
    let ss: SpreadsheetState;
    let id: string;

    beforeEach(() => {
        ss = useSpreadsheet();
        ss.addTable();
        id = ss.tables.value[0].id;
        ss.selectCell(id, 0, 0);
    });

    describe('formula mode', () => {
        it('toggles on and off', () => {
            ss.startEditing('=');
            ss.toggleFormulaMode();
            expect(ss.formulaMode.value).toBe(true);
            ss.toggleFormulaMode();
            expect(ss.formulaMode.value).toBe(false);
        });
    });

    describe('buildCellReferenceString', () => {
        it('uses a bare reference inside the same table', () => {
            expect(ss.buildCellReferenceString(id, 2, 3)).toBe('C4');
        });

        it('qualifies a table on the same canvas', () => {
            ss.addTable();
            const other = ss.tables.value[1].id;
            ss.renameTable(other, 'Other');
            expect(ss.buildCellReferenceString(other, 0, 0)).toBe('Other::A1');
        });

        it('quotes a name that is not a bare identifier', () => {
            ss.addTable();
            const other = ss.tables.value[1].id;
            expect(ss.buildCellReferenceString(other, 0, 0)).toBe("'Table 2'::A1");
        });

        it('qualifies a table on another canvas with the canvas name too', () => {
            ss.addCanvas();
            ss.addTable();
            const remote = ss.tables.value[0].id;
            ss.renameTable(remote, 'Remote');
            ss.renameCanvas(ss.canvases.value[1].id, 'Two');
            ss.switchCanvas(ss.canvases.value[0].id);
            ss.selectCell(id, 0, 0);
            expect(ss.buildCellReferenceString(remote, 0, 0)).toBe('Two::Remote::A1');
        });

        it('returns nothing with no active cell', () => {
            ss.newFile();
            expect(ss.buildCellReferenceString(id, 0, 0)).toBe('');
        });

        it('falls back to a bare reference for an unknown table', () => {
            expect(ss.buildCellReferenceString('nope', 1, 1)).toBe('B2');
        });
    });

    describe('insertCellReference', () => {
        beforeEach(() => {
            ss.startEditing('=');
            ss.toggleFormulaMode();
        });

        it('appends the first reference straight after the equals sign', () => {
            ss.insertCellReference(id, 1, 0);
            expect(ss.editValue.value).toBe('=B1');
        });

        it('joins a second reference with a plus', () => {
            ss.insertCellReference(id, 1, 0);
            ss.insertCellReference(id, 2, 0);
            expect(ss.editValue.value).toBe('=B1+C1');
        });

        it('appends straight after an operator', () => {
            ss.editValue.value = '=B1*';
            ss.insertCellReference(id, 2, 0);
            expect(ss.editValue.value).toBe('=B1*C1');
        });

        it('appends straight after an open paren or comma', () => {
            ss.editValue.value = '=SUM(';
            ss.insertCellReference(id, 0, 0);
            expect(ss.editValue.value).toBe('=SUM(A1');
            ss.editValue.value = '=SUM(A1,';
            ss.insertCellReference(id, 1, 0);
            expect(ss.editValue.value).toBe('=SUM(A1,B1');
        });

        it('colours each reference for the overlay', () => {
            ss.insertCellReference(id, 1, 0);
            ss.insertCellReference(id, 2, 0);
            expect(ss.formulaRefs.value).toHaveLength(2);
            expect(ss.formulaRefs.value[0].color).not.toBe(ss.formulaRefs.value[1].color);
        });

        it('does nothing outside formula mode', () => {
            ss.toggleFormulaMode();
            ss.editValue.value = '=';
            ss.insertCellReference(id, 1, 0);
            expect(ss.editValue.value).toBe('=');
        });
    });

    describe('getFormulaTokens', () => {
        it('marks references apart from the rest', () => {
            const tokens = ss.getFormulaTokens('=A1+2');
            expect(tokens.filter((t) => t.isRef).map((t) => t.text)).toEqual(['A1']);
        });

        it('returns a non-formula as one plain token', () => {
            const tokens = ss.getFormulaTokens('plain text');
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toMatchObject({ text: 'plain text', isRef: false });
        });

        it('reads the live edit buffer when given nothing', () => {
            ss.startEditing('=A1');
            expect(ss.getFormulaTokens().some((t) => t.isRef)).toBe(true);
        });

        it('marks a qualified reference as one token', () => {
            ss.addTable();
            ss.renameTable(ss.tables.value[1].id, 'Other');
            const refs = ss.getFormulaTokens('=Other::A1').filter((t) => t.isRef);
            expect(refs).toHaveLength(1);
            expect(refs[0].text).toBe('Other::A1');
        });
    });

    describe('resolveRefString', () => {
        it('resolves a bare reference against the active table', () => {
            expect(ss.resolveRefString('B2')).toMatchObject({ tableId: id, col: 1, row: 1, isRange: false });
        });

        it('resolves a range', () => {
            expect(ss.resolveRefString('A1:C3')).toMatchObject({
                col: 0,
                row: 0,
                endCol: 2,
                endRow: 2,
                isRange: true,
            });
        });

        it('resolves a table-qualified reference', () => {
            ss.addTable();
            const other = ss.tables.value[1].id;
            ss.renameTable(other, 'Other');
            expect(ss.resolveRefString('Other::A1')).toMatchObject({ tableId: other });
        });

        it('resolves a canvas-qualified reference', () => {
            ss.renameTable(id, 'Home');
            ss.renameCanvas(ss.canvases.value[0].id, 'One');
            expect(ss.resolveRefString('One::Home::A1')).toMatchObject({ tableId: id });
        });

        it('returns null for anything it cannot parse', () => {
            expect(ss.resolveRefString('nonsense')).toBeNull();
            expect(ss.resolveRefString('Missing::A1')).toBeNull();
            expect(ss.resolveRefString('a::b::c::A1')).toBeNull();
        });

        it('returns null with no active cell', () => {
            ss.newFile();
            expect(ss.resolveRefString('A1')).toBeNull();
        });
    });

    describe('getFormulaHighlights', () => {
        it('highlights every cell a reference names', () => {
            ss.startEditing('=A1:B2');
            ss.toggleFormulaMode();
            const highlights = ss.getFormulaHighlights();
            expect(highlights).toHaveLength(4);
        });

        it('returns nothing outside an edit', () => {
            expect(ss.getFormulaHighlights()).toEqual([]);
        });
    });
});
