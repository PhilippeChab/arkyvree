import { Document, Page, Text, pdf } from "@react-pdf/renderer";

const document = (
  <Document>
    <Page>
      <Text>Regular Helvetica</Text>
      <Text style={{ fontWeight: 700 }}>Bold Helvetica</Text>
      <Text style={{ fontStyle: "italic" }}>Italic Helvetica</Text>
      <Text style={{ fontWeight: 700, fontStyle: "italic" }}>Bold italic Helvetica</Text>
    </Page>
  </Document>
);

await Bun.write(Bun.stdout, await pdf(document).toBlob());
