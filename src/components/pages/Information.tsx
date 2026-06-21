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
              <li><b>TOP-1</b> supplier of weapons of mass destruction, worldwide</li>
              <li>Forged to <b>German quality</b> standards — precision-machined, over-tested</li>
              <li>No bias toward customers — every client, one price sheet</li>
              <li>We protect your privacy — end-to-end, <b>AES-512</b>, zero manifest retention</li>
            </ul>
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
