Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\retai\Downloads\monipack fullstack crm"
Dim currentPath
currentPath = WshShell.ExpandEnvironmentStrings("%PATH%")
WshShell.Environment("PROCESS")("PATH") = "C:\Users\retai\AppData\Local\Programs\nodejs;" & currentPath
WshShell.Run "node server/index.js", 0, False
