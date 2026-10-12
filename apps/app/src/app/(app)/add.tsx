import { View } from "react-native";
import { Txt } from "@/ui/Txt";

export default function Page() {
  return (
    <View pointerEvents="box-none" style={{ flex: 1 }}>
      <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 440, backgroundColor: "#222" }}>
        <Txt>task</Txt>
      </View>
    </View>
  );
}
