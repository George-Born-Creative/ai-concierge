import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

type ToastEntry = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant) => void;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  show: () => undefined,
});

export function useToast() {
  return useContext(ToastContext);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const VARIANT_CONFIG: Record<
  ToastVariant,
  { bg: string; border: string; icon: string; iconColor: string; textColor: string }
> = {
  success: {
    bg: '#F0FAF3',
    border: '#B7E4C7',
    icon: 'check-circle',
    iconColor: '#1E8449',
    textColor: '#1A5C33',
  },
  error: {
    bg: '#FFF0F0',
    border: '#FFBCBC',
    icon: 'error-outline',
    iconColor: '#C0392B',
    textColor: '#7B241C',
  },
  info: {
    bg: '#EDF4FF',
    border: '#BDD7FF',
    icon: 'info-outline',
    iconColor: '#1A73E8',
    textColor: '#174EA6',
  },
  warning: {
    bg: '#FFFBEC',
    border: '#FFE082',
    icon: 'warning-amber',
    iconColor: '#B7860B',
    textColor: '#7D5A00',
  },
};

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: () => void }) {
  const config = VARIANT_CONFIG[entry.variant];
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 260,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Defer parent setState so it never runs during another component's render.
      setTimeout(() => onDismissRef.current(), 0);
    });
  }, [opacity, translateY]);

  // Slide in once on mount, then auto-dismiss after a hold.
  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(() => {
      holdTimer = setTimeout(dismiss, 3200);
    });

    return () => {
      if (holdTimer) clearTimeout(holdTimer);
    };
    // Run only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY }], opacity }]}>
      <View
        style={[
          styles.toastInner,
          { backgroundColor: config.bg, borderColor: config.border },
        ]}>
        <MaterialIcons name={config.icon as never} size={20} color={config.iconColor} />
        <Text style={[styles.toastText, { color: config.textColor }]}>{entry.message}</Text>
        <Pressable onPress={dismiss} hitSlop={10}>
          <MaterialIcons name="close" size={18} color={config.iconColor} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const counter = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((entry) => (
          <ToastItem key={entry.id} entry={entry} onDismiss={() => remove(entry.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 56,
    zIndex: 9999,
    gap: 8,
    paddingHorizontal: 12,
  },
  toast: {
    width: '100%',
  },
  toastInner: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  toastText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
});
