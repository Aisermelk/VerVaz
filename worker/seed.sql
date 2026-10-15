-- Dados iniciais do tenant "alquimia". Preços ficam NULL: o editor funciona,
-- mas o checkout só libera depois que você cadastrar o preço (UPDATE abaixo ou painel).
INSERT OR IGNORE INTO atelier_settings (tenant, data) VALUES ('alquimia',
 '{"productionDays":7,"draftRetentionDays":7,"maxUploadBytes":15728640,"originPostalCode":"","flatShipping":[]}');

INSERT OR IGNORE INTO atelier_products
 (id,tenant,name,description,price_cents,stock,category_name,active,kind,size_id,meta,weight_g,width_cm,height_cm,length_cm,sort,created_at,updated_at) VALUES
 ('azulejo-10x20','alquimia','Azulejo personalizado 10 × 20 cm','Azulejo com a sua imagem.',NULL,999,'Azulejos',1,'tile','10x20','{"minimumDpi":150}',250,12,22,4,1,strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('azulejo-15x20','alquimia','Azulejo personalizado 15 × 20 cm','Azulejo com a sua imagem.',NULL,999,'Azulejos',1,'tile','15x20','{"minimumDpi":150}',350,17,22,4,2,strftime('%s','now')*1000,strftime('%s','now')*1000),
 ('azulejo-20x30','alquimia','Azulejo personalizado 20 × 30 cm','Azulejo com a sua imagem.',NULL,999,'Azulejos',1,'tile','20x30','{"minimumDpi":150}',700,22,32,4,3,strftime('%s','now')*1000,strftime('%s','now')*1000);

-- Exemplo de frete fixo (use enquanto não tiver Melhor Envio):
-- UPDATE atelier_settings SET data = json_set(data,'$.flatShipping',json('[{"serviceCode":"fixo","carrier":"Correios","name":"PAC","amountCents":2500,"minTransitDays":5,"maxTransitDays":10}]')) WHERE tenant='alquimia';
-- Exemplo de preço:
-- UPDATE atelier_products SET price_cents = 8900 WHERE id='azulejo-15x20';
