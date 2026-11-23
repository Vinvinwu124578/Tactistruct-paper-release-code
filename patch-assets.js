const versions={
  patch4:'3989d8174b9a17193d4a6a75374658aaa34f7b71',
  raw10:'0b4683da07886196a159dc338c6c6a9e3b9f6d4e'
};

export function patchAssets(mode){
  if(!Object.hasOwn(versions,mode))throw Error('Unknown input protocol');
  if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){
    return new URL('patch-assets/'+mode+'/',location.href).href;
  }
  return 'https://raw.githubusercontent.com/Vinvinwu124578/Tactistruct-paper-release-code/'+versions[mode]+'/';
}
