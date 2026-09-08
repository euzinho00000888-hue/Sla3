/**
 * Custom Home Screen
 * -------------------
 * Adiciona um botãozinho flutuante fixo no canto superior direito da tela.
 * Tocando nele, abre um modal em tela cheia com botões e ícones de servidor
 * que você pode arrastar e soltar onde quiser. As posições ficam salvas.
 *
 * IMPORTANTE (leia antes de instalar):
 * O Revenge/Vendetta não tem uma API oficial e documentada para "adicionar
 * um botão em qualquer lugar da tela". Este plugin usa uma técnica comum na
 * comunidade: encontrar um componente que é renderizado o tempo todo
 * (o container das abas principais) e "grudar" nosso botão do lado dele.
 * O nome interno desse componente (`MainTabsV2`) pode mudar entre versões
 * do Discord. Se o botão não aparecer depois de instalar, é sinal de que
 * o nome mudou e o `findByName` abaixo precisa ser ajustado.
 */

import { findByProps, findByName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

const { View, Text, Pressable, Modal, StyleSheet, PanResponder, Dimensions } =
  ReactNative;

const GuildStore = findByProps("getGuilds", "getGuild");
const NavigationNative = findByProps("navigate", "push", "pushLazy");

let unpatchHome;
let ModalOpenSetter = null;

// Garante que a storage do plugin já comece com um formato previsível.
storage.buttons ??= [
  { id: "friends", label: "Amigos", x: 20, y: 100 },
  { id: "settings", label: "Ajustes", x: 20, y: 180 },
];
storage.serverPositions ??= {};

function DraggableItem({ id, label, x, y, onPress, onMove, style }) {
  const pan = React.useRef(new ReactNative.Animated.ValueXY({ x, y })).current;

  const responder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: ReactNative.Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderGrant: () => {
        pan.setOffset({ x: pan.x._value, y: pan.y._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        onMove(id, pan.x._value, pan.y._value);
      },
    })
  ).current;

  return React.createElement(
    ReactNative.Animated.View,
    {
      ...responder.panHandlers,
      style: [
        { position: "absolute", transform: pan.getTranslateTransform() },
        style,
      ],
    },
    React.createElement(
      Pressable,
      {
        onLongPress: () => {}, // arrastar já é o "long press" natural do gesto
        onPress: () => onPress(id),
        style: {
          backgroundColor: "#2b2d31",
          borderRadius: 24,
          paddingVertical: 10,
          paddingHorizontal: 16,
        },
      },
      React.createElement(Text, { style: { color: "white" } }, label)
    )
  );
}

function HomeScreenModal({ visible, onClose }) {
  const [buttons, setButtons] = React.useState(storage.buttons);
  const guilds = GuildStore ? Object.values(GuildStore.getGuilds()) : [];

  const moveButton = (id, x, y) => {
    const updated = buttons.map((b) => (b.id === id ? { ...b, x, y } : b));
    setButtons(updated);
    storage.buttons = updated;
  };

  const moveServer = (id, x, y) => {
    storage.serverPositions = { ...storage.serverPositions, [id]: { x, y } };
  };

  return React.createElement(
    Modal,
    { visible, animationType: "fade", transparent: false },
    React.createElement(
      View,
      { style: { flex: 1, backgroundColor: "#1e1f22" } },
      React.createElement(
        Pressable,
        {
          onPress: onClose,
          style: {
            position: "absolute",
            top: 40,
            right: 20,
            zIndex: 10,
            backgroundColor: "#313338",
            borderRadius: 20,
            padding: 8,
          },
        },
        React.createElement(Text, { style: { color: "white" } }, "Fechar")
      ),
      buttons.map((b) =>
        React.createElement(DraggableItem, {
          key: b.id,
          id: b.id,
          label: b.label,
          x: b.x,
          y: b.y,
          onPress: () => {},
          onMove: moveButton,
        })
      ),
      guilds.map((g, i) => {
        const saved = storage.serverPositions[g.id];
        const x = saved ? saved.x : 20 + (i % 4) * 70;
        const y = saved ? saved.y : 280 + Math.floor(i / 4) * 70;
        return React.createElement(DraggableItem, {
          key: g.id,
          id: g.id,
          label: g.name?.slice(0, 2) ?? "??",
          x,
          y,
          onPress: () => {
            NavigationNative?.navigate?.("GuildDetail", { guildId: g.id });
          },
          onMove: moveServer,
          style: {
            width: 56,
            height: 56,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
          },
        });
      })
    )
  );
}

function FloatingButton() {
  const [visible, setVisible] = React.useState(false);
  ModalOpenSetter = setVisible;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      Pressable,
      {
        onPress: () => setVisible(true),
        style: {
          position: "absolute",
          top: 44,
          right: 12,
          zIndex: 999,
          backgroundColor: "#5865f2",
          borderRadius: 18,
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
        },
      },
      React.createElement(Text, { style: { color: "white" } }, "⌂")
    ),
    React.createElement(HomeScreenModal, {
      visible,
      onClose: () => setVisible(false),
    })
  );
}

export default {
  onLoad() {
    const MainTabs = findByName("MainTabsV2", false);
    if (!MainTabs) {
      console.log(
        "[CustomHomeScreen] Não encontrei o componente das abas principais. " +
          "O nome interno pode ter mudado nesta versão do Discord."
      );
      return;
    }

    unpatchHome = after("default", MainTabs, (_args, res) => {
      if (!res?.props?.children) return res;
      // Empacota o conteúdo original junto com nosso botão flutuante.
      return React.createElement(
        React.Fragment,
        null,
        res,
        React.createElement(FloatingButton, null)
      );
    });
  },
  onUnload() {
    unpatchHome?.();
  },
};
