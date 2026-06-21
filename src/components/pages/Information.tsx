export default function Information() {
  return (
    <>
      <div className="page-head">
        <div className="left">
          <span className="crumb">// INFO.DOSSIER</span>
          <h1>CORPORATE DOSSIER <span className="sub">/ BBB-X · OPEN FILE</span></h1>
        </div>
        <div className="meta">
          <div><span className="k">FOUNDED</span><span className="v">2061</span></div>
          <div><span className="k">REGISTRY</span><span className="v">SOL-9</span></div>
          <div><span className="k">STATUS</span><span className="v green">ACTIVE</span></div>
        </div>
      </div>
      <div className="info">
        <div className="dossier glass">
          <div className="col about">
            <h3>// WHO WE ARE</h3>
            <ul className="lore">
              <li><b>TOP-1</b> supplier of orbital ordnance logistics across the Sol Combine</li>
              <li>Operating since <b>2061</b> — nine autonomous fabrication yards in the Belt</li>
              <li>No-bias procurement: every accredited faction, one price sheet</li>
              <li>Hand-forged warheads from certified Tier-Ω foundries</li>
              <li>Privacy first — end-to-end, <b>AES-512</b>, zero manifest retention</li>
            </ul>
            <div className="record">
              <span className="k">// CAREER HIGH</span>
              <p>First major contract, <b>2063</b> — the Halcyon Accord. Netted <b>₡271M</b> over four orbital cycles and put BBB on every registry in the system.</p>
            </div>
          </div>
          <div className="col disc">
            <div className="seal">FICTION</div>
            <div className="msg">
              <div className="t">This is <em>satire</em>.</div>
              <div className="s">
                BBB is an invented company set in the year 2079. Every product, statistic,
                price and client is fictional. Nothing here exists and nothing can be bought.
                Any resemblance to real people, countries, companies or events is coincidental
                and unintended.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
