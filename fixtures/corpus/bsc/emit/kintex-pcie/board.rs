// * generated-by: @solderlab/bsc (rust)
// * board: kintex-pcie
// * source-revision: 056792c009a8920d4ef11e76ba3284ee58376078
// * bsc-schema-version: 1.0
// * source-sha256: 7163b90302e2264fd0d17a43ec9ff7640c42c0b8fcd355b6678c22a646050323
// * DO NOT EDIT

//! Board Support Contract — kintex-pcie
#![allow(non_upper_case_globals)]

pub const SOLDERLAB_BSC_VERSION: &str = "1.0";
pub const BOARD_NAME: &str = "kintex-pcie";

pub mod pins {
}

pub mod rails {
    // N1V_EN: voltage unknown
    // N1V_PG: voltage unknown
    pub const N3V3_AUX_MV: u32 = 3300;
    pub const N3V3_PCIE_MV: u32 = 3300;
}

pub mod i2c {
}
