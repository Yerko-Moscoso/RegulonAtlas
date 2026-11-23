import { useSyncExternalStore } from "react";
import { Languages } from "lucide-react";
import { getLanguage, setLanguage, subscribeLanguage } from "../i18n/translator";

// Botón inferior del menú: muestra el idioma al que se va a cambiar, siempre escrito en ese idioma.
export default function LanguageToggle() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const next = language === "es" ? "en" : "es";

  return (
    <div className="border-t border-[#D9E2E7] p-3 shrink-0">
      <button
        type="button"
        data-no-i18n
        data-testid="language-toggle"
        onClick={() => setLanguage(next)}
        aria-label={next === "es" ? "Cambiar idioma a español" : "Switch language to English"}
        title={next === "es" ? "Cambiar idioma a español" : "Switch language to English"}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-[#64748B] border border-[#D9E2E7] hover:bg-[#F7FAFC] hover:text-[#334155] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3A9D7C]"
      >
        <Languages size={15} className="text-[#3A9D7C]" />
        <span>{next === "es" ? "Español" : "English"}</span>
        <span className="ml-auto text-[10px] font-semibold text-[#94A3B8]">{language.toUpperCase()}</span>
      </button>
    </div>
  );
}
