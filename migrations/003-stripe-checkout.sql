CREATE TABLE IF NOT EXISTS stripe_checkout_attempts (
 tenant_id TEXT NOT NULL REFERENCES workspaces(tenant_id),
 request_id UUID NOT NULL,
 plan TEXT NOT NULL CHECK(plan IN ('Solo','Business')),
 seats INTEGER NOT NULL CHECK(seats BETWEEN 1 AND 50),
 session_id TEXT NOT NULL UNIQUE,
 session_url TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(tenant_id,request_id)
);
REVOKE ALL ON stripe_checkout_attempts, stripe_customers, stripe_subscriptions, stripe_events FROM PUBLIC;
