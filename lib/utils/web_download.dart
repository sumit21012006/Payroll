import 'web_download_stub.dart'
    if (dart.library.html) 'web_download_web.dart' as loader;

dynamic downloadFile(List<int> bytes, String fileName) {
  return loader.downloadFile(bytes, fileName);
}
