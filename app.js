import fs from 'fs';
import readline from 'readline';
import { app, query, errorHandler, sparqlEscapeDateTime } from 'mu';
import isFileSigned from './lib/signed-file';
import { getPieceUriFromFile, getPieceUrlFromFile, reinsertPiece } from './lib/piece';

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

      const result = await this._getPiecesFromDb(lastCreated);
      const newUris = result.uris;

      uris = oldUris.concat(newUris);
      lastCreated = result.lastCreated ?? lastCreated;
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
      if (line) {
        uris.push(line);
      }
    }
    return uris;
  }

  _writePiecesToCache(uris, lastCreated) {
    console.debug(uris.length);
    if (uris?.length) {
      fs.writeFileSync(this.cachePath, '');
      for (const uri of uris) {
        fs.appendFileSync(this.cachePath, `${uri}\n`);
      }
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
    ?file nie:dataSource ?virtualFile ;
      dct:format ?format .
    FILTER EXISTS { ?serie dossier:Collectie.bestaatUit ?piece }
    FILTER NOT EXISTS { ?piece sign:ongetekendStuk ?unsignedPiece }
    FILTER (CONTAINS(LCASE(?format), "pdf"))
    FILTER (?created > ${sparqlEscapeDateTime(startDate)})
    FILTER (?created < ${sparqlEscapeDateTime(this.DATE_SIGNATURE_REMOVER_IN_USE)})
  }
}
ORDER BY ?created
LIMIT ${this.BATCH_SIZE}`;
    };

    let uris = [];
    let lastCreated = startDate ?? this.DATE_START_KALEIDOS;
    while (true) {
      const queryString = paginatedQuery(lastCreated);
      const response = await query(queryString, { sudo: true });

      if (!response?.results?.bindings?.length) {
        break;
      }

      const bindings = response.results.bindings;


      uris = uris.concat(bindings.map((b) => b["file"]["value"]));
      lastCreated = new Date(bindings[bindings.length - 1]["created"]["value"]);
    }

    return { uris, lastCreated };
  }
}

const pieceCache = new PieceCache();
app.post('/', async function (req, res) {
  const uris = await pieceCache.getPieceUris();

  console.log(`Found ${uris.length} files, checking which ones are signed...`);

  console.log(uris.slice(uris.length - 3));

  const signedUris = [];

  for (const uri of uris) {
    // Find out which files are signed
    try {
      if (await isFileSigned(uri)) {
        signedUris.push(uri);
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (signedUris?.length) {
    const signedFilesPath = '/cache/signed-uris';
    console.log(`Found ${signedUris.length} signed files, storing in ${signedFilesPath}`);
    const stream = fs.createWriteStream(signedFilesPath);
    for (const uri of signedUris) {
      stream.write(`${uri}\n`);
    }
    stream.close();
  }

  res.sendStatus(204);
});

/**
 * Use this endpoint to get a single URI's Kaleidos URL. By default this
 * uses the ACC domain to generate the domain, but you can remove -test
 * from the URL to get a link to PROD. You can use the URIs found in
 * /cache/signed-uris for this endpoint.
 * 
 * Note that you need to URLEncode the URIs, since they have slashes and
 * such, in bash you can use the following command:
 * > curl http://localhost/piece-url/$(printf "physical-uri-goes-here" | jq -sRr '@uri')
 */
app.get('/piece-url/:physicalUri', async function (req, res) {
  const physicalUri = req.params.physicalUri;

  const pieceUrl = await getPieceUrlFromFile(physicalUri);

  const response = {};
  if (pieceUrl) {
    response.url = pieceUrl;
  } else {
    response.message = 'No URL could be found for the given physical URI, check if the passed in URI is correct';
  }

  res.send(response);
});

app.post('/strip-piece/:physicalUri', async function (req, res) {
  const physicalUri = req.params.physicalUri;

  const pieceUri = await getPieceUriFromFile(physicalUri);

  if (pieceUri) {
    await reinsertPiece(pieceUri);
    res.sendStatus(204);
  } else {
    res.sendStatus(404);
  }
});


app.use(errorHandler);
