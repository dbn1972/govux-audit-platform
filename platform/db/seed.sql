-- ============================================================
-- GovUX Audit Platform — Seed Data (v1.1)
-- Safe, idempotent seed script. Creates Department of Posts organisation,
-- owner and steward users, domains, schedules, and discovered domains.
-- ============================================================

DO $$
DECLARE
    org_id UUID := '00000000-0000-0000-0000-000000000001';
    owner_id UUID := '00000000-0000-0000-0000-000000000002';
    steward_id UUID := '00000000-0000-0000-0000-000000000003';
    dom1_id UUID := '00000000-0000-0000-0000-000000000011';
    dom2_id UUID := '00000000-0000-0000-0000-000000000012';
    dom3_id UUID := '00000000-0000-0000-0000-000000000013';
BEGIN
    -- Check if seed has already been run (based on steward existence)
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'steward@indiapost.gov.in') THEN
        
        -- Insert organisation if none exists
        IF NOT EXISTS (SELECT 1 FROM organisations LIMIT 1) THEN
            INSERT INTO organisations (id, name, org_type, studio_enabled)
            VALUES (org_id, 'Department of Posts (India Post)', 'department', true);
        ELSE
            SELECT id INTO org_id FROM organisations LIMIT 1;
        END IF;

        -- Insert users
        INSERT INTO users (id, email, org_id, display_name, role, is_active)
        VALUES 
            (owner_id, 'd.nayak@indiapost.gov.in', org_id, 'D. Nayak', 'owner', true),
            (steward_id, 'steward@indiapost.gov.in', org_id, 'MeitY/NIC Steward', 'programme_admin', true)
        ON CONFLICT (email) DO UPDATE 
        SET role = EXCLUDED.role, org_id = EXCLUDED.org_id;

        -- Insert domains
        INSERT INTO domains (id, org_id, url, tld, service_category, size_class, verify_status, created_by)
        VALUES
            (dom1_id, org_id, 'indiapost.gov.in', 'gov.in', 'transactional', 'large', 'verified', owner_id),
            (dom2_id, org_id, 'ncsc.dop.gov.in', 'gov.in', 'transactional', 'large', 'verified', owner_id),
            (dom3_id, org_id, 'ippbonline.gov.in', 'gov.in', 'payments', 'large', 'verified', owner_id)
        ON CONFLICT (url) DO NOTHING;

        -- Insert schedule
        INSERT INTO schedules (domain_id, cadence, enabled, next_run_at, created_by)
        VALUES (dom1_id, 'weekly', true, now() + interval '7 days', steward_id);

        -- Insert discovered domains
        INSERT INTO discovered_domains (url, source, seed)
        VALUES 
            ('cept.gov.in', 'registry', 'seed'),
            ('postagestamps.gov.in', 'registry', 'seed')
        ON CONFLICT (url) DO NOTHING;

    ELSE
        -- Ensure the steward is set to programme_admin if already present
        UPDATE users 
        SET role = 'programme_admin' 
        WHERE email = 'steward@indiapost.gov.in';
    END IF;
END $$;
