import { SHOP_ITEMS, FURNITURE_ITEMS, FURNITURE_SETS } from "../net/types";

interface ShopPanelProps {
  coins: number;
  ownedItems: string[];
  equippedHat: string | null;
  onBuy: (itemId: string) => void;
  onEquip: (hatId: string | null) => void;
  ownedFurniture: string[];
  placedFurniture: string[];
  onBuyFurniture: (itemId: string) => void;
  onTogglePlace: (itemId: string) => void;
  onStartPlacement: (itemId: string) => void;
}

export function ShopPanel({
  coins,
  ownedItems,
  equippedHat,
  onBuy,
  onEquip,
  ownedFurniture,
  placedFurniture,
  onBuyFurniture,
  onTogglePlace,
  onStartPlacement,
}: ShopPanelProps) {
  return (
    <div id="shop-panel">
      <div id="shop-header">
        <span id="shop-title">🛍 Boutique</span>
        <span id="shop-coins">🪙 {coins}</span>
      </div>

      <div id="shop-section-label">🎩 Chapeaux</div>
      <div id="shop-grid">
        {SHOP_ITEMS.map((item) => {
          const owned = ownedItems.includes(item.id);
          const equipped = equippedHat === item.id;
          return (
            <div
              key={item.id}
              className={`shop-item${equipped ? " equipped" : ""}`}
            >
              <span className="shop-item-emoji">{item.emoji}</span>
              <span className="shop-item-name">{item.name}</span>
              <span className="shop-item-price">
                {owned ? "✓ Possédé" : `${item.price} 🪙`}
              </span>
              {owned ? (
                <button
                  className={`shop-equip-btn${equipped ? " active" : ""}`}
                  onClick={() => onEquip(equipped ? null : item.id)}
                >
                  {equipped ? "Retirer" : "Équiper"}
                </button>
              ) : (
                <button
                  className="shop-buy-btn"
                  disabled={coins < item.price}
                  onClick={() => onBuy(item.id)}
                  title={
                    coins < item.price
                      ? `Besoin de ${item.price} 🪙`
                      : `Acheter pour ${item.price} 🪙`
                  }
                >
                  Acheter
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div id="shop-section-label">🏡 Mobilier</div>
      <div id="shop-grid">
        {FURNITURE_ITEMS.map((item) => {
          const owned = ownedFurniture.includes(item.id);
          return (
            <div key={item.id} className={`shop-item${owned ? " equipped" : ""}`}>
              <span className="shop-item-emoji">{item.emoji}</span>
              <span className="shop-item-name">
                {item.name}
                {item.setId && (
                  <span className="shop-item-set-badge">
                    {FURNITURE_SETS.find((s) => s.id === item.setId)?.emoji}
                  </span>
                )}
              </span>
              <span className="shop-item-price">
                {owned ? (
                  <span className="shop-bonus-tag">{item.bonus}</span>
                ) : (
                  `${item.price} 🪙`
                )}
              </span>
              {owned ? (
                placedFurniture.includes(item.id) ? (
                  <div className="shop-placed-actions">
                    <button
                      className="shop-toggle-place-btn"
                      onClick={() => onStartPlacement(item.id)}
                      title="Déplacer dans la chambre"
                    >
                      🏠 Replacer
                    </button>
                    <button
                      className="shop-toggle-place-btn placed"
                      onClick={() => onTogglePlace(item.id)}
                      title="Ranger dans l’inventaire"
                    >
                      📦 Ranger
                    </button>
                  </div>
                ) : (
                  <button
                    className="shop-toggle-place-btn"
                    onClick={() => onStartPlacement(item.id)}
                  >
                    🏠 Replacer
                  </button>
                )
              ) : (
                <button
                  className="shop-buy-btn"
                  disabled={coins < item.price}
                  onClick={() => onBuyFurniture(item.id)}
                  title={
                    coins < item.price
                      ? `Besoin de ${item.price} 🪙`
                      : `${item.bonus}`
                  }
                >
                  Acheter
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div id="shop-section-label">✨ Sets de mobilier</div>
      <div id="shop-sets">
        {FURNITURE_SETS.map((set) => {
          const complete = set.items.every((id) => ownedFurniture.includes(id));
          const ownedCount = set.items.filter((id) => ownedFurniture.includes(id)).length;
          return (
            <div key={set.id} className={`shop-set${complete ? " complete" : ""}`}>
              <div className="shop-set-header">
                <span className="shop-set-emoji">{set.emoji}</span>
                <span className="shop-set-name">{set.name}</span>
                {complete
                  ? <span className="shop-set-active">✨ Actif</span>
                  : <span className="shop-set-progress">{ownedCount}/{set.items.length}</span>
                }
              </div>
              <div className="shop-set-items">
                {set.items.map((itemId) => {
                  const fItem = FURNITURE_ITEMS.find((f) => f.id === itemId)!;
                  const owned = ownedFurniture.includes(itemId);
                  return (
                    <span key={itemId} className={`shop-set-item${owned ? " owned" : ""}`}>
                      {fItem.emoji} {fItem.name}
                    </span>
                  );
                })}
              </div>
              <div className="shop-set-bonus">{set.bonusDescription}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

