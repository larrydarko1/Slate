import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import NoteEditor from '@/renderer/components/table/NoteEditor.vue';

describe('NoteEditor', () => {
    let wrapper: VueWrapper;

    const editor = (): HTMLElement | null => document.body.querySelector('.note-editor');
    const textarea = (): HTMLTextAreaElement | null => document.body.querySelector('.note-editor textarea');

    function mountEditor(props: Record<string, unknown> = {}): void {
        wrapper = mount(NoteEditor, {
            props: { visible: true, x: 10, y: 20, text: '', hasExisting: false, ...props },
        });
    }

    afterEach(() => {
        wrapper.unmount();
    });

    it('stays hidden when not visible', () => {
        mountEditor({ visible: false });
        expect(editor()).toBeNull();
    });

    it('opens at the given point with the text it was given', () => {
        mountEditor({ text: 'existing' });
        expect(editor()?.style.left).toBe('10px');
        expect(textarea()?.value).toBe('existing');
    });

    it('reports what is typed', async () => {
        mountEditor();
        const area = textarea() as HTMLTextAreaElement;
        area.value = 'typed';
        area.dispatchEvent(new Event('input'));
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('update:text')?.at(-1)).toEqual(['typed']);
    });

    it('saves on the save button', async () => {
        mountEditor({ text: 'typed' });
        const buttons = [...(editor()?.querySelectorAll('button') ?? [])];
        buttons.find((b) => /save/i.test(b.textContent ?? ''))?.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('save')?.[0]).toEqual(['typed']);
    });

    it('cancels on the cancel button', async () => {
        mountEditor();
        const buttons = [...(editor()?.querySelectorAll('button') ?? [])];
        buttons.find((b) => /cancel/i.test(b.textContent ?? ''))?.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('cancel')).toHaveLength(1);
    });

    it('offers delete only for a note that already exists', () => {
        mountEditor({ hasExisting: false });
        const withoutDelete = [...(editor()?.querySelectorAll('button') ?? [])];
        expect(withoutDelete.some((b) => /delete/i.test(b.textContent ?? ''))).toBe(false);
        wrapper.unmount();

        mountEditor({ hasExisting: true });
        const withDelete = [...(editor()?.querySelectorAll('button') ?? [])];
        expect(withDelete.some((b) => /delete/i.test(b.textContent ?? ''))).toBe(true);
    });

    it('deletes on the delete button', async () => {
        mountEditor({ hasExisting: true, text: 'old' });
        const buttons = [...(editor()?.querySelectorAll('button') ?? [])];
        buttons.find((b) => /delete/i.test(b.textContent ?? ''))?.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('delete')).toHaveLength(1);
    });

    it('focuses the textarea when it opens', async () => {
        mountEditor({ visible: false });
        await wrapper.setProps({ visible: true });
        await wrapper.vm.$nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(document.activeElement).toBe(textarea());
    });
});
