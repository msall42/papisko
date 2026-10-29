-- Démonstration uniquement. Aucune vente, photo ou remise présentée comme réelle.
INSERT OR IGNORE INTO products(id,category_id,name,description,condition,image_url,price,compare_price,flash_price,flash_start,flash_end,demo,created_at) VALUES
('demo-robe','femme','Robe en coton','DÉMONSTRATION — Exemple de fiche. Remplacer par vos photos et la description réelle.','neuf','',8500,12000,7000,unixepoch(),unixepoch()+86400,1,unixepoch()),
('demo-chemise','homme','Chemise décontractée','DÉMONSTRATION — Exemple de vêtement neuf.','neuf','',6500,8500,NULL,NULL,NULL,1,unixepoch()-1),
('demo-veste','femme','Veste vintage','DÉMONSTRATION — Pièce de friperie. Décrire ici son état et ses éventuels défauts.','friperie','',4500,NULL,NULL,NULL,NULL,1,unixepoch()-2),
('demo-jean','homme','Jean seconde main','DÉMONSTRATION — Pièce unique de friperie.','friperie','',3500,5000,NULL,NULL,NULL,1,unixepoch()-3),
('demo-ensemble','enfant','Ensemble enfant','DÉMONSTRATION — Exemple de vêtement neuf.','neuf','',5500,NULL,NULL,NULL,NULL,1,unixepoch()-4),
('demo-haut','femme','Haut léger','DÉMONSTRATION — Pièce unique de friperie.','friperie','',2500,NULL,NULL,NULL,NULL,1,unixepoch()-5);
INSERT OR IGNORE INTO variants VALUES('demo-robe-m','demo-robe','M · Terracotta',5),('demo-robe-l','demo-robe','L · Terracotta',3),('demo-chemise-m','demo-chemise','M · Écru',6),('demo-veste-m','demo-veste','M · Bleu',1),('demo-jean-40','demo-jean','40 · Indigo',1),('demo-enfant-6','demo-ensemble','6 ans · Sable',3),('demo-haut-s','demo-haut','S · Sauge',1);
