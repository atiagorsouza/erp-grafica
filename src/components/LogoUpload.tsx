"use client";

import { useRef, useState } from "react";
import { Button, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/format";

/**
 * Upload de logo com prévia (v3.46.2).
 *
 * A prévia é mostrada sobre xadrez cinza quando a logo é para fundo
 * claro, e sobre fundo escuro quando é a versão `_dark`. Sem isso o
 * usuário sobe uma logo branca, vê um retângulo vazio e acha que
 * falhou — quando na verdade é branco sobre branco.
 */

const XADREZ =
  "repeating-conic-gradient(#e8ecf2 0% 25%, #ffffff 0% 50%) 50% / 14px 14px";

export function LogoUpload({
  chave,
  valor,
  escura,
  onChange,
}: {
  chave: string;
  valor: string;
  escura?: boolean;
  onChange: (dataUri: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", arquivo);
      fd.append("key", chave);
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Não foi possível enviar a imagem.");
        return;
      }
      onChange(json.dataUri);
      const kb = Math.round(json.bytes / 1024);
      toast.success(`Logo enviada (${kb} KB).`);
    } catch {
      toast.error("Falha de rede ao enviar a imagem.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remover() {
    setEnviando(true);
    try {
      await fetch(`/api/upload/logo?key=${encodeURIComponent(chave)}`, { method: "DELETE" });
      onChange("");
      toast.success("Logo removida.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          void enviar(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors",
          arrastando ? "border-proc-c bg-proc-c/5" : "border-paper-300"
        )}
      >
        {/* PRÉVIA */}
        <div
          className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-paper-300"
          style={escura ? { background: "#0e1420" } : { background: XADREZ }}
        >
          {valor ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={valor}
              alt="Prévia da logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className={cn("text-[10px]", escura ? "text-ink-500" : "text-ink-400")}>
              sem logo
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void enviar(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="download" className="h-3.5 w-3.5 rotate-180" />
              {enviando ? "Enviando..." : valor ? "Trocar" : "Escolher imagem"}
            </Button>
            {valor && (
              <Button size="sm" variant="ghost" disabled={enviando} onClick={() => void remover()}>
                Remover
              </Button>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-ink-400">
            PNG, JPG, WEBP ou SVG · até 2 MB · pode arrastar o arquivo aqui
          </p>
        </div>
      </div>
    </div>
  );
}
