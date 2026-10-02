import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O mammoth (leitura de .docx no upload de anotações) é carregado direto
  // do node_modules pelo servidor, em vez de ser empacotado.
  serverExternalPackages: ["mammoth"],
};

export default nextConfig;
