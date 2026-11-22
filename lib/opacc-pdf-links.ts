// Fixed public PDF copies checked byte-for-byte against the saved originals on 2026-11-22.
// No inference, downloads, keys or runtime network fallback. Original payloads remain unchanged.
const copies: Readonly<Record<string, {originalURL: string; archiveURL: string}>> = {
  "451cb84509f781be8545dc6c9e43b6663038668fdda5b5a51568f6672f0dc1eb": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120250813541248.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20250814/140120250813541248.pdf"
  },
  "f678a0792dfd7024b8b883e3f0e3d5e9fac2b4618126e38b537f85fc574e7441": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120251113500995.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20251114/140120251113500995.pdf"
  },
  "3b7493310199f838b5bd3bebc98a96f8b04c532ee37289609349ac2090514389": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260512526861.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260513/140120260512526861.pdf"
  },
  "45f7f4dfb32dcc18e402c96dfd400249b322849ed04583e277441c894ca6ad4d": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260812518724.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260813/140120260812518724.pdf"
  },
  "daf6c955de7306272164c7b174875dbdf3cdeb599536d1243a59323a84215f98": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260812518728.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260813/140120260812518728.pdf"
  },
  "ffff450ffe94cd8107483ec2dcf8d53f86ee076b0808e630cd8d5db3b0edbd45": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120261112576743.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20261113/140120261112576743.pdf"
  },
  "ad673763f3d16e44fad841d34b8ac36c0d337cb9c338edb4942a8183d79d6ff5": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120261112576775.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20261113/140120261112576775.pdf"
  },
  "9a0960a3700588460b3ed5d0968183a162c49fc13b5d4632e7b96434f0143321": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260511522691.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260512/140120260511522691.pdf"
  },
  "272764c2c97df8ba9d366292252039aa703574d047329a806fe3c39bf7ea84e8": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260812517800.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260812/140120260812517800.pdf"
  },
  "29d858a40031d5202926e82a91969788b517269d521571c5d054cf39b387c8d8": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260812517882.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260812/140120260812517882.pdf"
  },
  "c91feb7506c749353c3a704acf4ef99ff7d855457929691043996c451a72cfa0": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120261111573900.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20261112/140120261111573900.pdf"
  },
  "ddac18dea9460734e3cf4ada489908ce2419ec1d6f232e78fb593eb4df8b421c": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120261111573945.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20261112/140120261111573945.pdf"
  },
  "c554edf59caacc67eeb94ea3d494eb6f4e1453688027af3a4baa2de8c338220e": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260511522392.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260511/140120260511522392.pdf"
  },
  "4154e210346e84028fb586ff3d2b5c4b52470bc3d49a8e91b7aab1eb037b72f6": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120260805510207.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20260805/140120260805510207.pdf"
  },
  "cd9d23ee51d8df80dcbb937676dbf1970fd0763c121d44deefce4ffbed6d1e2c": {
    "originalURL": "https://www.release.tdnet.info/inbs/140120261113578538.pdf",
    "archiveURL": "https://f.irbank.net/pdf/20261113/140120261113578538.pdf"
  }
};
export function verifiedPDFLink(source: {url: string; sha256: string}, page: number): string | undefined {
  if (!Number.isSafeInteger(page) || page < 1 || !/^[a-f0-9]{64}$/.test(source.sha256)) return undefined;
  const copy = Object.prototype.hasOwnProperty.call(copies, source.sha256) ? copies[source.sha256] : undefined;
  if (!copy || source.url !== copy.originalURL) return undefined;
  return `${copy.archiveURL}#page=${page}`;
}

export function verifiedArchiveURL(sha: string): string | undefined {
  if (!/^[a-f0-9]{64}$/.test(sha)) return undefined;
  return Object.prototype.hasOwnProperty.call(copies,sha) ? copies[sha].archiveURL : undefined;
}
