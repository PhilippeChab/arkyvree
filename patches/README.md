# PDFKit standalone font loading

`pdfkit@0.20.2` is pinned and patched because its Node ESM build loads standard
fonts through an aliased `createRequire`. Bun's standalone compiler leaves those
calls unresolved, so the Fly binaries cannot load Helvetica without node_modules.

The patch replaces those lazy loads with static imports of the same 14 font data
modules. It preserves font data and the PDFKit API and lets Bun embed the modules
in both web and worker binaries. Docker copies the patch before installing.

`bun run test:pdf-bundle` compiles and runs a PDF generator outside the checkout,
checking regular, bold, italic, and bold-italic Helvetica. CI runs this check before
deployment. Retest that command before updating PDFKit or removing this patch.
