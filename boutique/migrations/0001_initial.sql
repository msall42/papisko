PRAGMA foreign_keys = ON;
CREATE TABLE sellers (id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
INSERT INTO sellers(id,name) VALUES('papisko','Papisko');
CREATE TABLE categories(id TEXT PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0);
INSERT INTO categories VALUES('femme','Mode femme',1),('homme','Mode homme',2),('enfant','Mode enfant',3);
CREATE TABLE products (
 id TEXT PRIMARY KEY, seller_id TEXT NOT NULL DEFAULT 'papisko' REFERENCES sellers(id), category_id TEXT NOT NULL REFERENCES categories(id),
 name TEXT NOT NULL, description TEXT NOT NULL, condition TEXT NOT NULL CHECK(condition IN('neuf','friperie')),
 image_url TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL CHECK(price>0), compare_price INTEGER CHECK(compare_price IS NULL OR compare_price>price),
 flash_price INTEGER CHECK(flash_price IS NULL OR (flash_price>0 AND flash_price<price)), flash_start INTEGER, flash_end INTEGER,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), demo INTEGER NOT NULL DEFAULT 0 CHECK(demo IN(0,1)), created_at INTEGER NOT NULL,
 CHECK(flash_price IS NULL OR (flash_start IS NOT NULL AND flash_end>flash_start))
);
CREATE INDEX products_catalog ON products(active,demo,category_id,condition,created_at DESC);
CREATE TABLE variants(id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), label TEXT NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0));
CREATE INDEX variants_product ON variants(product_id);
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings VALUES('delivery','{"originLat":null,"originLon":null,"originLabel":"Sicap Mbao, Dakar","eta":"24 à 48 heures après confirmation"}');
CREATE TABLE orders (
 id TEXT PRIMARY KEY, access_hash TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
 subtotal INTEGER NOT NULL CHECK(subtotal>=0), delivery_fee INTEGER NOT NULL CHECK(delivery_fee>=0), distance_km REAL NOT NULL,
 total INTEGER NOT NULL CHECK(total=subtotal+delivery_fee), method TEXT NOT NULL CHECK(method IN('wave_manual','cash')),
 status TEXT NOT NULL DEFAULT 'en_attente' CHECK(status IN('en_attente','payee','expediee','livree','annulee')),
 demo INTEGER NOT NULL CHECK(demo IN(0,1)), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX orders_recent ON orders(created_at DESC,id DESC);
CREATE TABLE order_items (
 id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), variant_id TEXT NOT NULL REFERENCES variants(id),
 seller_id TEXT NOT NULL REFERENCES sellers(id), name TEXT NOT NULL, variant_label TEXT NOT NULL,
 unit_price INTEGER NOT NULL CHECK(unit_price>0), quantity INTEGER NOT NULL CHECK(quantity>0)
);
CREATE INDEX order_items_order ON order_items(order_id);
-- Le trigger rend la réservation atomique : le batch D1 entier est annulé en cas de rupture.
CREATE TRIGGER reserve_stock BEFORE INSERT ON order_items BEGIN
 UPDATE variants SET stock=stock-NEW.quantity WHERE id=NEW.variant_id AND stock>=NEW.quantity;
 SELECT CASE WHEN changes()=0 THEN RAISE(ABORT,'STOCK_UNAVAILABLE') END;
END;
CREATE TRIGGER restore_stock AFTER UPDATE OF status ON orders WHEN NEW.status='annulee' AND OLD.status!='annulee' BEGIN
 UPDATE variants SET stock=stock+COALESCE((SELECT SUM(quantity) FROM order_items WHERE order_id=NEW.id AND variant_id=variants.id),0)
 WHERE id IN(SELECT variant_id FROM order_items WHERE order_id=NEW.id);
END;
CREATE TABLE payments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id), provider TEXT NOT NULL DEFAULT 'manual',
 method TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL DEFAULT 'XOF' CHECK(currency='XOF'),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','paid','cancelled')), external_reference TEXT UNIQUE, confirmed_at INTEGER
);
CREATE TABLE deliveries(order_id TEXT PRIMARY KEY REFERENCES orders(id), scheduled_at TEXT, slot TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'a_planifier' CHECK(status IN('a_planifier','planifiee','en_cours','livree','annulee')));
CREATE TABLE order_history(id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), action TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX history_order ON order_history(order_id);
CREATE TABLE admin_sessions(token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_limit_expiry ON rate_limits(expires_at);
