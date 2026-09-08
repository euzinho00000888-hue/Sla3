/**
 * Edit History
 * ------------
 * Guarda cada versão de uma mensagem sempre que ela é editada (via evento
 * MESSAGE_UPDATE do Flux) e adiciona uma opção "Ver Histórico" no menu que
 * abre quando você segura uma mensagem — mas só aparece se a mensagem
 * realmente já foi editada.
 *
 * IMPORTANTE: assim como no outro plugin, a forma de "injetar uma opção no
 * menu de segurar mensagem" depende de encontrar o componente certo
 * (`MessageLongPressActionSheet`) dentro do bundle do Discord. Isso é
 * reverse engineering por natureza — funciona hoje, mas pode quebrar numa
 * atualização futura do Discord, e nesse caso o nome usado no
 * `findByName` precisa ser atualizado.
 */

import { findByProps, findByName } from "@vendetta/metro";
import { FluxDispatcher, React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { Forms } from "@vendetta/ui/components";

const { FormRow } = Forms;
const { ScrollView, Text, View } = ReactNative;

let unpatchSheet;
let unsubscribeFlux;

storage.history ??= {}; // { [messageId]: [{ content, editedAt }, ...] }
const MAX_VERSIONS_PER_MESSAGE = 20;

function recordEdit(message) {
  if (!message?.id || typeof message.content !== "string") return;
  const list = storage.history[message.id] ?? [];
  list.push({
    content: message.content,
    editedAt: Date.now(),
  });
  if (list.length > MAX_VERSIONS_PER_MESSAGE) list.shift();
  storage.history = { ...storage.history, [message.id]: list };
}

function showHistory(message) {
  const versions = storage.history[message.id] ?? [];
  showConfirmationAlert({
    title: "Histórico de edições",
    content: React.createElement(
      ScrollView,
      { style: { maxHeight: 300 } },
      versions.length === 0
        ? React.createElement(
            Text,
            { style: { color: "white" } },
            "Nenhuma versão anterior salva ainda (o plugin só guarda a partir do momento em que foi instalado)."
          )
        : versions
            .map((v, i) =>
              React.createElement(
                View,
                { key: i, style: { marginBottom: 12 } },
                React.createElement(
                  Text,
                  { style: { color: "#949ba4", fontSize: 12 } },
                  new Date(v.editedAt).toLocaleString()
                ),
                React.createElement(Text, { style: { color: "white" } }, v.content)
              )
            )
            .reverse()
    ),
    confirmText: "Fechar",
    onConfirm: () => {},
  });
}

export default {
  onLoad() {
    // 1. Escuta edições em tempo real para ir guardando o histórico.
    const handler = (event) => {
      const msg = event?.message;
      if (msg) recordEdit(msg);
    };
    FluxDispatcher.subscribe("MESSAGE_UPDATE", handler);
    unsubscribeFlux = () => FluxDispatcher.unsubscribe("MESSAGE_UPDATE", handler);

    // 2. Injeta a opção no menu de segurar mensagem.
    const ActionSheetModule = findByProps("openLazy", "hideActionSheet");
    if (!ActionSheetModule) {
      console.log("[EditHistory] Não encontrei o módulo de action sheets.");
      return;
    }

    unpatchSheet = after("openLazy", ActionSheetModule, (args) => {
      const [sheetPromise, sheetKey, sheetProps] = args;
      if (sheetKey !== "MessageLongPressActionSheet") return;

      sheetPromise?.then?.((module) => {
        const Sheet = module?.default;
        if (!Sheet || Sheet.__editHistoryPatched) return;
        Sheet.__editHistoryPatched = true;

        after("default", module, (_a, res) => {
          const message = sheetProps?.message;
          if (!message?.editedTimestamp) return res; // só mostra se foi editada

          const extraRow = React.createElement(FormRow, {
            key: "edit-history-row",
            label: "Ver Histórico",
            leading: React.createElement(FormRow.Icon, {
              source: findByProps("getAssetIds")
                ? undefined
                : undefined, // ícone é opcional; deixe undefined se não tiver certeza do asset
            }),
            onPress: () => {
              ActionSheetModule.hideActionSheet?.();
              showHistory(message);
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
    unsubscribeFlux?.();
  },
};
