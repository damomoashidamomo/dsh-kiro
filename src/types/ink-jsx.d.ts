/**
 * Augment JSX.IntrinsicElements so TypeScript knows about Ink's lowercase
 * HTML-style tags: `<box>`, `<text>`, plus the props Ink's flexbox layout
 * understands. Ink accepts any prop on `box` and `text` because the runtime
 * uses Yoga's flexbox model — we model that with an open index signature.
 */

declare global {
  namespace JSX {
    interface InkBaseProps {
      children?: React.ReactNode
      key?: string | number
    }

    interface IntrinsicElements {
      box: InkBaseProps & { [key: string]: unknown }
      text: InkBaseProps & { [key: string]: unknown }
    }
  }
}

export {}
