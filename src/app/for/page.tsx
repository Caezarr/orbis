import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getHubs, getHubMeta, getJobsByHub } from "@/data/verticals/wave1";

const hubCardStyles = `
  .hub-card {
    padding: 36px;
    border: 1px solid #dfe7f3;
    border-radius: 16px;
    background: #fff;
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-decoration: none;
    color: inherit;
    transition: all 0.25s;
  }
  .hub-card:hover {
    box-shadow: 0 12px 32px #263f6512;
    transform: translateY(-3px);
    border-color: #b9ccef;
  }
`;

export const metadata: Metadata = {
  title: "Industries & Verticals — Orbis",
  description:
    "AI missions built for your industry. Choose the vertical that matches your business and install the busywork into Orbis.",
};

export default function ForIndexPage() {
  const hubs = getHubs();
  const hubsWithMeta = hubs
    .map((hub) => ({
      hub,
      meta: getHubMeta(hub),
      jobCount: getJobsByHub(hub).length,
    }))
    .filter((h) => h.meta !== undefined);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: hubCardStyles }} />
      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(#eff5ff, white 35%)",
          fontFamily: "var(--font-geist-sans), sans-serif",
        }}
      >
      {/* Nav */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: "88px",
          padding: "0 max(28px, calc((100vw - 1280px) / 2))",
          background: "#ffffffed",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid #eaf0f7",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "28px",
            fontWeight: "600",
            letterSpacing: "-1.3px",
            color: "#182d5b",
            textDecoration: "none",
          }}
        >
          <Image src="/brand/orbis-mark.svg" width={36} height={36} alt="" />
          Orbis
        </Link>
        <nav style={{ display: "flex", gap: "30px", fontSize: "13px" }}>
          <Link href="/catalog" style={{ color: "#576781" }}>
            All missions
          </Link>
          <Link href="/pricing" style={{ color: "#576781" }}>
            Pricing
          </Link>
          <Link href="/today" style={{ color: "#576781" }}>
            Login
          </Link>
        </nav>
      </header>

      {/* Main */}
      <main
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "80px 35px",
        }}
      >
        <header style={{ marginBottom: "60px", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "clamp(38px, 4.5vw, 58px)",
              fontWeight: "450",
              lineHeight: "1.13",
              letterSpacing: "-2px",
              color: "#182d5b",
              marginBottom: "22px",
            }}
          >
            Missions built for your industry.
          </h1>
          <p
            style={{
              fontSize: "17px",
              color: "#748098",
              maxWidth: "640px",
              margin: "0 auto",
              lineHeight: "1.7",
            }}
          >
            Choose your vertical. Install the busywork into Orbis. Keep the
            expertise, lose a little of the overload.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "24px",
          }}
        >
          {hubsWithMeta.map(({ hub, meta, jobCount }) => {
            if (!meta) return null;
            return (
              <Link
                key={hub}
                href={`/for/${hub}`}
                className="hub-card"
              >
                <div>
                  <h2
                    style={{
                      fontSize: "24px",
                      fontWeight: "500",
                      letterSpacing: "-0.5px",
                      color: "#182d5b",
                      margin: "0 0 12px",
                    }}
                  >
                    {meta.label}
                  </h2>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "#748098",
                      lineHeight: "1.6",
                      margin: "0",
                    }}
                  >
                    {meta.pain.split(".")[0]}.
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "12px",
                    borderTop: "1px solid #e9f0f7",
                    marginTop: "auto",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "#8394b1" }}>
                    {jobCount} {jobCount === 1 ? "mission" : "missions"}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                      color: "#315ee8",
                      fontWeight: "500",
                    }}
                  >
                    Explore <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: "80px",
            padding: "50px 40px",
            background: "linear-gradient(145deg, #f7faff, #fff)",
            border: "1px solid #dce6f5",
            borderRadius: "18px",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontSize: "32px",
              fontWeight: "450",
              letterSpacing: "-1px",
              color: "#182d5b",
              marginBottom: "16px",
            }}
          >
            Don't see your industry?
          </h2>
          <p
            style={{
              fontSize: "15px",
              color: "#748098",
              marginBottom: "28px",
            }}
          >
            Browse the full mission catalog or test your company's potential.
          </p>
          <div
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/catalog"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "15px 24px",
                background: "#182d5b",
                color: "#fff",
                borderRadius: "9px",
                fontSize: "13px",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              Browse all missions
            </Link>
            <Link
              href="/audit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "15px 24px",
                background: "transparent",
                color: "#182d5b",
                border: "1px solid #cbd7eb",
                borderRadius: "9px",
                fontSize: "13px",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              Test my company
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          padding: "60px 35px 30px",
          borderTop: "1px solid #e2e9f3",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "50px",
        }}
      >
        <div>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "28px",
              fontWeight: "600",
              letterSpacing: "-1.3px",
              color: "#182d5b",
              textDecoration: "none",
            }}
          >
            <Image src="/brand/orbis-mark.svg" width={36} height={36} alt="" />
            Orbis
          </Link>
          <p style={{ fontSize: "13px", color: "#8997ae", marginTop: "18px" }}>
            Your company. Your tools.
            <br />
            Work you supervise.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            fontSize: "12px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#526887" }}>Explore</span>
          <Link href="/catalog" style={{ color: "#7e8ca4" }}>
            Mission catalogue
          </Link>
          <Link href="/audit" style={{ color: "#7e8ca4" }}>
            Company audit
          </Link>
          <Link href="/pricing" style={{ color: "#7e8ca4" }}>
            Pricing & usage
          </Link>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            fontSize: "12px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#526887" }}>
            Build with Orbis
          </span>
          <Link href="/audit?audience=integrator" style={{ color: "#7e8ca4" }}>
            For integrators
          </Link>
          <Link href="/connections" style={{ color: "#7e8ca4" }}>
            Tools & access
          </Link>
          <Link href="/today" style={{ color: "#7e8ca4" }}>
            Your workspace
          </Link>
        </div>
      </footer>
    </div>
    </>
  );
}
