import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';

Future<String?> downloadFile(List<int> bytes, String fileName) async {
  try {
    final Uint8List uint8Bytes = Uint8List.fromList(bytes);
    
    String? outputPath;
    bool didFail = false;
    
    try {
      final extension = fileName.split('.').last;
      outputPath = await FilePicker.platform.saveFile(
        dialogTitle: 'Save $fileName',
        fileName: fileName,
        type: FileType.custom,
        allowedExtensions: [extension],
        bytes: uint8Bytes,
      );
    } catch (e) {
      print("FilePicker saveFile failed: $e. Using fallback directory.");
      didFail = true;
    }

    if (outputPath != null) {
      final file = File(outputPath);
      if (!file.existsSync() || file.lengthSync() == 0) {
        await file.writeAsBytes(uint8Bytes);
      }
      return file.path;
    } else if (didFail) {
      Directory? dir;
      if (Platform.isAndroid) {
        dir = await getExternalStorageDirectory();
        dir ??= await getApplicationDocumentsDirectory();
      } else if (Platform.isIOS) {
        dir = await getApplicationDocumentsDirectory();
      } else {
        dir = await getDownloadsDirectory();
        dir ??= await getApplicationDocumentsDirectory();
      }

      final file = File('${dir.path}/$fileName');
      await file.writeAsBytes(uint8Bytes);
      return file.path;
    } else {
      return null;
    }
  } catch (e) {
    print("Error saving file: $e");
    return null;
  }
}
