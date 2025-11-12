/**
 * Type declarations for html-docx-js
 * 
 * This module doesn't have official type definitions,
 * so we provide our own for TypeScript compatibility.
 */

declare module 'html-docx-js' {
  interface HtmlDocx {
    asBlob(html: string, options?: unknown): Blob;
  }
  const htmlDocx: HtmlDocx;
  export = htmlDocx;
}

declare module 'html-docx-js/dist/html-docx' {
  interface HtmlDocx {
    asBlob(html: string, options?: unknown): Blob;
  }
  const htmlDocx: HtmlDocx;
  export default htmlDocx;
}

