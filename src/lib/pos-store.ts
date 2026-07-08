import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unit: "unidade" | "peso" | "pacote";
  stock: number;
};

export type MinimizedSale = {
  id: string;
  label: string;
  items: CartItem[];
  discount: number;
  observation: string;
  createdAt: number;
};

type State = {
  cart: CartItem[];
  discount: number;
  observation: string;
  minimized: MinimizedSale[];
  addItem: (item: CartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  updatePrice: (productId: string, price: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  setDiscount: (v: number) => void;
  setObservation: (v: string) => void;
  minimizeCurrent: (max: number) => boolean;
  restoreMinimized: (id: string) => void;
  removeMinimized: (id: string) => void;
};

export const usePosStore = create<State>()(
  persist(
    (set, get) => ({
      cart: [],
      discount: 0,
      observation: "",
      minimized: [],
      addItem: (item) =>
        set((s) => {
          const existing = s.cart.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              cart: s.cart.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            };
          }
          return { cart: [...s.cart, item] };
        }),
      updateQuantity: (productId, quantity) =>
        set((s) => ({
          cart: s.cart.map((i) =>
            i.productId === productId ? { ...i, quantity: Math.max(0, quantity) } : i
          ),
        })),
      updatePrice: (productId, price) =>
        set((s) => ({
          cart: s.cart.map((i) =>
            i.productId === productId ? { ...i, unitPrice: Math.max(0, price) } : i
          ),
        })),
      removeItem: (productId) =>
        set((s) => ({ cart: s.cart.filter((i) => i.productId !== productId) })),
      clear: () => set({ cart: [], discount: 0, observation: "" }),
      setDiscount: (v) => set({ discount: Math.max(0, v) }),
      setObservation: (v) => set({ observation: v }),
      minimizeCurrent: (max) => {
        const s = get();
        if (!s.cart.length) return false;
        if (s.minimized.length >= max) return false;
        const id = crypto.randomUUID();
        set({
          minimized: [
            ...s.minimized,
            {
              id,
              label: `#${s.minimized.length + 1}`,
              items: s.cart,
              discount: s.discount,
              observation: s.observation,
              createdAt: Date.now(),
            },
          ],
          cart: [],
          discount: 0,
          observation: "",
        });
        return true;
      },
      restoreMinimized: (id) => {
        const s = get();
        const m = s.minimized.find((x) => x.id === id);
        if (!m) return;
        // move current to minimized if not empty, then restore
        if (s.cart.length) {
          set({
            minimized: [
              ...s.minimized.filter((x) => x.id !== id),
              {
                id: crypto.randomUUID(),
                label: `#${s.minimized.length}`,
                items: s.cart,
                discount: s.discount,
                observation: s.observation,
                createdAt: Date.now(),
              },
            ],
            cart: m.items,
            discount: m.discount,
            observation: m.observation,
          });
        } else {
          set({
            minimized: s.minimized.filter((x) => x.id !== id),
            cart: m.items,
            discount: m.discount,
            observation: m.observation,
          });
        }
      },
      removeMinimized: (id) =>
        set((s) => ({ minimized: s.minimized.filter((x) => x.id !== id) })),
    }),
    { name: "pdv-pos-store" }
  )
);

export function cartTotals(cart: CartItem[], discount: number) {
  const subtotal = cart.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const total = Math.max(0, subtotal - discount);
  const items = cart.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, total, items };
}
