/// <reference types="vite/client" />

declare module '*.css' {
  const css: string;
  export default css;
}

declare module '@fontsource-variable/lora';
declare module '@fontsource-variable/lora/wght-italic.css';