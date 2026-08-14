# PDF Template Assets

This directory contains safe, reusable PDF source templates required for development on another
machine.

## Liftrucks invoice template

[`liftrucks-invoice-template.pdf`](liftrucks-invoice-template.pdf) is the sanitized, single-page
GreenTree-style invoice layout used by provisional quotations and Chargeable Invoice approval
documents. It is generated from the tracked blank raster at
`api/assets/chargeable-invoice-approval-template.png` and deliberately contains no selectable or
recoverable customer, Job, Equipment, or invoice text.

The application continues to render from the PNG asset because flattening the background prevents
hidden values from an original invoice PDF surviving in generated customer documents. The tracked
PDF is a portable design/development reference; it is not loaded at runtime.

Do not add generated `PO-approval-*`, quotation, imported GreenTree invoice, or other customer/job
PDFs to this directory. Local generated samples remain under the ignored `output/pdf/` directory.
