// Единая точка доступа к данным. Если в config.js указан проект Supabase — работаем с базой,
// иначе — демо-режим в localStorage. Витрина и админка не знают, какой режим включён.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export * from './core.js';
export const MODE = SUPABASE_URL && SUPABASE_KEY ? 'remote' : 'local';

const B = MODE === 'remote' ? await import('./remote.js') : await import('./local.js');

export const {
  info, init, onChange, products, archived, categories, product, category, settings, orders, moves, admins, me, nextSku,
  saveProduct, archiveProduct, restoreProduct, setVisible, saveCategory, removeCategory, moveCategory,
  stockMove, createOrder, setOrderStatus, updateOrder, track, dashboard, uploadImage, auth,
  addAdmin, removeAdmin, setSettings, wipe, exportJSON, importJSON,
} = B;
