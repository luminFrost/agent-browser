// 화면에 보이는 일반 창(layer 0)의 소유 프로세스 pid를 줄마다 출력한다. 창 이름을 읽지 않으므로 화면 기록 권한이 필요 없다.
import CoreGraphics
import Foundation
let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
let list = (raw as NSArray?) as? [NSDictionary] ?? []
for w in list where (w["kCGWindowLayer"] as? Int) == 0 {
  if let pid = w["kCGWindowOwnerPID"] as? Int { print(pid) }
}
