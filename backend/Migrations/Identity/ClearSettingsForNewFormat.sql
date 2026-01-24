-- Migration: Clear user settings to reset to new skill+actionType format
-- Run this against identity.db after deploying the new code

-- Clear all user settings (they will be re-initialized with new format on Settings page visit)
UPDATE AspNetUsers SET Settings = NULL;
