-- Vérification finale dans la transaction : une modification de prix ou de visibilité
-- entre la lecture et la réservation ne peut pas produire une facture incohérente.
CREATE TRIGGER guard_item_price BEFORE INSERT ON order_items BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM variants v JOIN products p ON p.id=v.product_id JOIN sellers s ON s.id=p.seller_id
  WHERE v.id=NEW.variant_id AND p.active=1 AND s.active=1 AND p.seller_id=NEW.seller_id
  AND (p.demo=0 OR (SELECT demo FROM orders WHERE id=NEW.order_id)=1)
  AND NEW.unit_price=CASE WHEN p.flash_price IS NOT NULL AND p.flash_start<=unixepoch() AND p.flash_end>unixepoch() THEN p.flash_price ELSE p.price END
 ) THEN RAISE(ABORT,'PRICE_CHANGED') END;
END;
CREATE TRIGGER guard_order_transition BEFORE UPDATE OF status ON orders WHEN OLD.status!=NEW.status BEGIN
 SELECT CASE WHEN NOT (
  (OLD.status='en_attente' AND NEW.status='payee' AND EXISTS(SELECT 1 FROM payments WHERE order_id=OLD.id AND status='paid')) OR
  (OLD.status='en_attente' AND NEW.status='annulee' AND EXISTS(SELECT 1 FROM payments WHERE order_id=OLD.id AND status='pending')) OR
  (OLD.status IN('en_attente','payee') AND NEW.status='expediee' AND (OLD.method='cash' OR EXISTS(SELECT 1 FROM payments WHERE order_id=OLD.id AND status='paid'))) OR
  (OLD.status='expediee' AND NEW.status='livree' AND EXISTS(SELECT 1 FROM payments WHERE order_id=OLD.id AND status='paid'))
 ) THEN RAISE(ABORT,'INVALID_ORDER_TRANSITION') END;
END;
CREATE TRIGGER guard_payment BEFORE UPDATE OF status ON payments WHEN OLD.status!=NEW.status BEGIN
 SELECT CASE WHEN OLD.status!='pending' OR
 (NEW.status='paid' AND EXISTS(SELECT 1 FROM orders WHERE id=OLD.order_id AND status='annulee'))
 THEN RAISE(ABORT,'INVALID_PAYMENT_TRANSITION') END;
END;
CREATE TRIGGER audit_order AFTER UPDATE OF status ON orders WHEN OLD.status!=NEW.status BEGIN
 INSERT INTO order_history(order_id,action,created_at) VALUES(NEW.id,'Statut : '||NEW.status,unixepoch());
END;
CREATE TRIGGER audit_payment AFTER UPDATE OF status ON payments WHEN OLD.status!=NEW.status BEGIN
 INSERT INTO order_history(order_id,action,created_at) VALUES(NEW.order_id,'Paiement : '||NEW.status,unixepoch());
END;
CREATE TRIGGER audit_delivery AFTER UPDATE OF scheduled_at,slot ON deliveries WHEN OLD.scheduled_at IS NOT NEW.scheduled_at OR OLD.slot!=NEW.slot BEGIN
 INSERT INTO order_history(order_id,action,created_at) VALUES(NEW.order_id,'Livraison prévue : '||NEW.scheduled_at||' '||NEW.slot,unixepoch());
END;
