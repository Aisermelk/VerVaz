-- Configuração inicial do ateliê. Não cria produtos duplicados.
-- Os produtos e preços são cadastrados no Catálogo do V8 Admin Universal.
INSERT OR IGNORE INTO atelier_settings (tenant, data) VALUES
('1b356c5c-c50d-4c4e-a16b-f3f3bafd2e45',
 '{"productionDays":7,"draftRetentionDays":7,"maxUploadBytes":15728640,"originPostalCode":"","flatShipping":[]}');
