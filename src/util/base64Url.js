export function base64UrlToUint8Array(base64UrlText) {
    const unpaddedText = base64UrlText.replace(/=+$/, '');
    const paddingLength = (4 - (unpaddedText.length % 4)) % 4;
    const base64Text = unpaddedText.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(paddingLength);
    const binaryText = atob(base64Text);

    return Uint8Array.from(binaryText, (character) => character.charCodeAt(0));
}

export function bufferToBase64Url(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binaryText = '';

    bytes.forEach((byte) => {
        binaryText += String.fromCharCode(byte);
    });

    return btoa(binaryText).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
