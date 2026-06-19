interface EventTarget {
    checked: boolean;
    closest(selectors: string): Element | null;
    dataset: DOMStringMap;
    disabled: boolean;
    files: FileList | null;
    name: string;
    style: CSSStyleDeclaration;
    value: string;
}

interface Element {
    checked: boolean;
    disabled: boolean;
    files: FileList | null;
    name: string;
    onclick: ((event: Event) => void) | null;
    style: CSSStyleDeclaration;
    value: string;
}

interface HTMLElement {
    checked: boolean;
    disabled: boolean;
    files: FileList | null;
    name: string;
    value: string;
}
