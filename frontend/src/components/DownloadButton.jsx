import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

// Con responseType "blob", el detalle de un error de la API también llega como Blob
const errorMessage = async (err) => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).detail ?? "The file could not be generated.";
    } catch {
      return "The file could not be generated.";
    }
  }
  return "The file could not be generated. Check that the backend is running.";
};

// Botón de descarga: request() debe devolver una respuesta de axios con un Blob.
export default function DownloadButton({ label, filename, request, disabled = false, title }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await request();
      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(await errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={download}
        disabled={disabled || busy}
        title={title}
        className="flex items-center gap-1.5 text-xs bg-[#176B57] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#12594A] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
        {busy ? "Preparing…" : label}
      </button>
      {error && <span className="text-[11px] text-[#D96C6C] max-w-56">{error}</span>}
    </div>
  );
}
