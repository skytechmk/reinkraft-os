import type { InventoryItem } from '../lib/types';

export type LogCategory = 'MATERIAL' | 'WELD' | 'CONSUMABLE' | 'HARDWARE';

/** Which log category a counter click writes. The folder decides; items from before folders use the old type and unit. */
export function categoryFor(item: InventoryItem): LogCategory {
  switch (item.folder) {
    case 'RAW': return 'MATERIAL';
    case 'HARDWARE': return 'HARDWARE';
    case 'ABRASIVES': return 'CONSUMABLE';
    case 'CHEMICAL': return 'CONSUMABLE';
    case 'WELDING': return 'WELD';
    default: break;
  }
  if (item.item_type === 'PROFILE' || item.item_type === 'SHEET') return 'MATERIAL';
  if (item.item_type === 'CONSUMABLE' && item.unit_label === 'M') return 'WELD';   // welding wire by the metre
  if (item.item_type === 'CONSUMABLE' || item.item_type === 'CHEMICAL') return 'CONSUMABLE';
  return 'HARDWARE';
}
