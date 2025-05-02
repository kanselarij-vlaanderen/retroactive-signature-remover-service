import fs from "fs";

function isMuFileTooLarge(physicalUri) {
  const SIZE_LIMIT = 1024_000_000; //= 1GB

  const filePath = shareUriToPath(physicalUri);
  const stats = fs.statSync(filePath);
  console.log(`File size: ${stats.size} bytes`);
  return stats.size > SIZE_LIMIT;
}

/**
 * @param {string} path 
 * @returns {string} The uri
 */
function pathToShareUri(path) {
  return path.replace('/share/', 'share://');
}

/**
 * @param {string} uri 
 * @returns {string} The path
 */
function shareUriToPath(uri) {
  return uri.replace('share://', '/share/');
}

export {
  isMuFileTooLarge,
  pathToShareUri,
  shareUriToPath,
}