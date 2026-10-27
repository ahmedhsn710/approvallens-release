# ApprovalLens 0.5.0 — bundled workspace setup

Install the extension and run **ApprovalLens: Enable for this workspace**. It bundles and starts the local companion, creates an editable rules file and merges project hooks/MCP configuration without replacing other integrations. No separate Node installation, source checkout or npm install is needed for this flow.

Rules are applied explicitly to a trusted snapshot outside the repository. Agent edits cannot silently relax active rules. The new commands support editing/applying rules, connecting hosted review, checking setup and disabling the workspace guard.

The private MCP evidence-review tool accepts bounded client-observed evidence, omits raw write bodies and returns validated Nemotron findings. The local guard remains authoritative and waits for explicit human approval. Access tokens live in editor SecretStorage; hosted inference remains a limited pilot, not unlimited public access.

macOS/Linux, single trusted local folder only. Native coverage remains limited to supported hook-delivered Read/whole-file Write/Delete operations. Shell and other unsupported hooked operations are denied; search may bypass Cursor hook coverage. There is no separate classifier model, OS sandbox or universal interception claim. Disable the workspace integration before uninstalling the extension.
