import { Text, View } from "@react-pdf/renderer";

import { styles } from "./styles.ts";

/** The header of the sheet's pages after the first: the character's name, and what the page holds. */
function ContinuationHeader({ name, label }: { label?: string; name: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.title}>{name || "Unnamed Character"}</Text>
      </View>
      {label && (
        <View style={styles.secondHeaderRight}>
          <Text style={styles.headerLabel}>{label}</Text>
        </View>
      )}
    </View>
  );
}

export default ContinuationHeader;
