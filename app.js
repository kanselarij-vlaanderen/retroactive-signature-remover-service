import fs from 'fs';
import readline from 'readline';
import { app, query, errorHandler, sparqlEscapeDateTime } from 'mu';
import { isMuFileTooLarge } from './lib/file';
import isFileSigned from './lib/signed-file';

class PieceCache {
  DATE_START_KALEIDOS = new Date("2019-10-02");
  DATE_SIGNATURE_REMOVER_IN_USE = new Date("2024-04-12");
  BATCH_SIZE = 100;

  cachePath = '/cache/pieces';
  lastCreatedPath = '/cache/last_created';

  async getPieceUris() {
    let uris = [];
    let lastCreated = null;

    if (fs.existsSync(this.lastCreatedPath)) {
      const lastCreatedValue = fs.readFileSync(this.lastCreatedPath, { encoding: 'utf-8' });
      lastCreated = new Date(lastCreatedValue.trim());

      const oldUris = await this._readPiecesFromCache();

      const result = this._getPiecesFromDb(lastCreated);
      const newUris = result.uris;
      lastCreated = result.lastCreated ?? lastCreated;

      uris = oldUris.concat(newUris);
    } else {
      const result = await this._getPiecesFromDb(this.DATE_START_KALEIDOS);
      uris = result.uris;
      lastCreated = result.lastCreated;
    }

    this._writePiecesToCache(uris, lastCreated);

    return uris;
  }

  async _readPiecesFromCache() {
    const uris = [];
    const stream = fs.createReadStream(this.cachePath);
    const rl = readline.createInterface({
      input: stream,
    });

    for await (const line of rl) {
      uris.push(line);
    }
    return uris;
  }

  _writePiecesToCache(uris, lastCreated) {
    if (uris?.length) {
      const stream = fs.createWriteStream(this.cachePath, { flags: 'a' });
      for (const uri of uris) {
        stream.write(`${uri}\n`);
      }
      stream.close();
    }

    if (lastCreated) {
      fs.writeFileSync(this.lastCreatedPath, lastCreated.toISOString());
    }
  }

  async _getPiecesFromDb(startDate) {
    const paginatedQuery = (startDate) => {
      return `PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX pav: <http://purl.org/pav/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

SELECT DISTINCT ?file ?created
WHERE {
  GRAPH <http://mu.semte.ch/graphs/organizations/kanselarij> {
    ?piece a dossier:Stuk ;
      prov:value ?virtualFile ;
      dct:created ?created .
    ?file nie:dataSource ?virtualFile .
    FILTER EXISTS { ?serie dossier:Collectie.bestaatUit ?piece }
    FILTER NOT EXISTS { ?piece sign:ongetekendStuk ?unsignedPiece }

    FILTER (?created > ${sparqlEscapeDateTime(startDate)})
    FILTER (?created < ${sparqlEscapeDateTime(this.DATE_SIGNATURE_REMOVER_IN_USE)})
  }
}
ORDER BY ?created
LIMIT ${this.BATCH_SIZE}`;
    };

    let uris = [];
    let lastCreated = startDate ?? this.DATE_START_KALEIDOS;
    do {
      const queryString = paginatedQuery(lastCreated);
      const response = await query(queryString, { sudo: true });

      if (!response?.results?.bindings?.length) {
        break;
      }

      const bindings = response.results.bindings;


      uris = uris.concat(bindings.map((b) => b["file"]["value"]));
      lastCreated = new Date(bindings[bindings.length - 1]["created"]["value"]);
    } while (true);

    return { uris, lastCreated };
  }
}

const pieceCache = new PieceCache();
app.post('/', async function (req, res) {
  const uris = await pieceCache.getPieceUris();

  console.log(`Found ${uris.length} files, checking which ones are signed...`);

  const signedUris = [];
  const tooLargeUris = [];

  for (const uri of uris) {
    // Find out which files are signed
    try {
      if (isMuFileTooLarge(uri)) {
        tooLargeUris.push(uri);
        continue;
      }

      if (isFileSigned(uri)) {
        signedUris.push(uri);
      }
    } catch (e) {
      console.error(e);
    }
  }

  const signedFilesPath = '/cache/signed-uris';
  console.log(`Found ${signedUris.length} signed files, storing in ${signedFilesPath}`);
  if (signedUris?.length) {
    const stream = fs.createWriteStream(signedFilesPath, { flags: 'a' });
    for (const uri of signedUris) {
      stream.write(`${uri}\n`);
    }
    stream.close();
  }

  const tooLargePath = '/cache/too-large-uris';
  console.log(`Found ${tooLargeUris.length} files that were too large and weren't processed, storing in ${tooLargePath}. Manual checks are required for these.`);
  if (tooLargeUris?.length) {
    const stream = fs.createWriteStream(tooLargePath, { flags: 'a' });
    for (const uri of tooLargeUris) {
      stream.write(`${uri}\n`);
    }
    stream.close();
  }

  res.sendStatus(204);
});


app.use(errorHandler);
