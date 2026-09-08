/**
 * Message Translator
 * -------------------
 * Adiciona "Traduzir" no mesmo menu de segurar-a-mensagem usado pelo
 * Edit History. Usa o endpoint público (não-oficial) do Google Tradutor —
 * é o mesmo truque usado por várias extensões de tradução gratuitas por aí.
 * Não precisa de chave de API, mas por não ser oficial pode parar de
 * funcionar sem aviso se o Google mudar algo.
 *
 * Mesmo aviso do Edit History quanto ao `findByName`/`openLazy`: depende de
 * reverse engineering do bundle do Discord e pode precisar de ajuste depois
 * de updates do app.
 */

import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { Forms } from "@vendetta/ui/components";

const { FormRow } = Forms;
const { Text, View } = ReactNative;

storage.targetLang ??= "pt"; // idioma padrão de destino

let unpatchSheet;

async function translate(text, targetLang) {
  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Formato de resposta: [[[ "texto traduzido", "texto original", ... ], ...], ...]
  return data[0].map((chunk) => chunk[0]).join("");
}

async function handleTranslate(message) {
  showToast("Traduzindo...");
  try {
    const translated = await translate(message.content, storage.targetLang);
    showConfirmationAlert({
      title: "Tradução",
      content: React.createElement(
        View,
        null,
        React.createElement(
          Text,
          { style: { color: "#949ba4", marginBottom: 8 } },
          "Original:"
        ),
        React.createElement(Text, { style: { color: "white", marginBottom: 16 } }, message.content),
        React.createElement(
          Text,
          { style: { color: "#949ba4", marginBottom: 8 } },
          `Traduzido (${storage.targetLang}):`
        ),
        React.createElement(Text, { style: { color: "white" } }, translated)
      ),
      confirmText: "Fechar",
      onConfirm: () => {},
    });
  } catch (e) {
    showToast("Falha ao traduzir: " + e.message);
  }
}

export default {
  onLoad() {
    const ActionSheetModule = findByProps("openLazy", "hideActionSheet");
    if (!ActionSheetModule) {
      console.log("[MessageTranslator] Não encontrei o módulo de action sheets.");
      return;
    }

    unpatchSheet = after("openLazy", ActionSheetModule, (args) => {
      const [sheetPromise, sheetKey, sheetProps] = args;
      if (sheetKey !== "MessageLongPressActionSheet") return;

      sheetPromise?.then?.((module) => {
        const Sheet = module?.default;
        if (!Sheet || Sheet.__translatorPatched) return;
        Sheet.__translatorPatched = true;

        after("default", module, (_a, res) => {
          const message = sheetProps?.message;
          if (!message?.content) return res;

          const extraRow = React.createElement(FormRow, {
            key: "translate-row",
            label: "Traduzir",
            onPress: () => {
              ActionSheetModule.hideActionSheet?.();
              handleTranslate(message);
            },
          });

          if (res?.props?.children) {
            res.props.children = Array.isArray(res.props.children)
              ? [...res.props.children, extraRow]
              : [res.props.children, extraRow];
          }
          return res;
        });
      });
    });
  },
  onUnload() {
    unpatchSheet?.();
  },
  settings: function Settings() {
    return React.createElement(
      View,
      { style: { padding: 16 } },
      React.createElement(
        Text,
        { style: { color: "white", marginBottom: 8 } },
        "Idioma de destino atual: " + storage.targetLang
      ),
      React.createElement(
        Text,
        { style: { color: "#949ba4" } },
        'Edite o código no topo do arquivo (storage.targetLang) para trocar, ex: "en", "es", "pt".'
      )
    );
  },
};
