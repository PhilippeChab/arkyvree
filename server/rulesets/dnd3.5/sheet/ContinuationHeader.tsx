import { Text, View } from "@react-pdf/renderer";

import { styles } from "./styles.ts";

const ContinuationHeader = ({ name, label }: { name: string; label?: string }) => (
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

export default ContinuationHeader;
