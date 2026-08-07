// * generated-by: @solderlab/bsc (rust)
// * board: upsy-desky
// * source-revision: 3fe1e14ff6250c9321da221a03aa932919f4842d
// * bsc-schema-version: 1.0
// * source-sha256: a6be1fa23a4f1b504e3d526249a8c9e84e06842851dbb829d3a0b05bd76de452
// * DO NOT EDIT

//! Board Support Contract — upsy-desky
#![allow(non_upper_case_globals)]

pub const SOLDERLAB_BSC_VERSION: &str = "1.0";
pub const BOARD_NAME: &str = "upsy-desky";

pub mod mcu {
    pub const REFDES: &str = "U3";
    pub const MPN: &str = "ESP32-WROOM-32";
}

pub mod pins {
    /// U3 pad 1 → Net-(C4-Pad2)
    pub const GND: u16 = 1;
    /// U3 pad 2 → Net-(#PWR013-Pad1)
    pub const VDD: u16 = 2;
    /// U3 pad 3 → Net-(U3-Pad3)
    pub const EN: u16 = 3;
    /// U3 pad 4 → Net-(U3-Pad4)
    pub const SENSOR_VP: u16 = 4;
    /// U3 pad 5 → Net-(U3-Pad5)
    pub const SENSOR_VN: u16 = 5;
    /// U3 pad 6 → Net-(U3-Pad6)
    pub const IO34: u16 = 6;
    /// U3 pad 7 → ESP_TX
    pub const IO35: u16 = 7;
    /// U3 pad 8 → Net-(U3-Pad8)
    pub const IO32: u16 = 8;
    /// U3 pad 9 → ESP_RX
    pub const IO33: u16 = 9;
    /// U3 pad 10 → Net-(U3-Pad10)
    pub const IO25: u16 = 10;
    /// U3 pad 11 → Net-(U3-Pad11)
    pub const IO26: u16 = 11;
    /// U3 pad 12 → Net-(U3-Pad12)
    pub const IO27: u16 = 12;
    /// U3 pad 13 → GPIO23
    pub const IO14: u16 = 13;
    /// U3 pad 14 → Net-(U3-Pad14)
    pub const IO12: u16 = 14;
    /// U3 pad 15 → Net-(C4-Pad2)
    pub const GND_15: u16 = 15;
    /// U3 pad 16 → Net-(U3-Pad16)
    pub const IO13: u16 = 16;
    /// U3 pad 17 → Net-(U3-Pad17)
    pub const SHD_SD2: u16 = 17;
    /// U3 pad 18 → Net-(U3-Pad18)
    pub const SWP_SD3: u16 = 18;
    /// U3 pad 19 → Net-(U3-Pad19)
    pub const SCS_CMD: u16 = 19;
    /// U3 pad 20 → Net-(U3-Pad20)
    pub const SCK_CLK: u16 = 20;
    /// U3 pad 21 → Net-(U3-Pad21)
    pub const SDO_SD0: u16 = 21;
    /// U3 pad 22 → Net-(U3-Pad22)
    pub const SDI_SD1: u16 = 22;
    /// U3 pad 23 → GPIO22
    pub const IO15: u16 = 23;
    /// U3 pad 24 → Net-(U3-Pad24)
    pub const IO2: u16 = 24;
    /// U3 pad 25 → Net-(U3-Pad25)
    pub const IO0: u16 = 25;
    /// U3 pad 26 → Net-(U3-Pad26)
    pub const IO4: u16 = 26;
    /// U3 pad 27 → GPIO21
    pub const IO16: u16 = 27;
    /// U3 pad 28 → GPIO19
    pub const IO17: u16 = 28;
    /// U3 pad 29 → Net-(U3-Pad29)
    pub const IO5: u16 = 29;
    /// U3 pad 30 → GPIO18
    pub const IO18: u16 = 30;
    /// U3 pad 31 → GPIO17
    pub const IO19: u16 = 31;
    /// U3 pad 32 → Net-(U3-Pad32)
    pub const NC: u16 = 32;
    /// U3 pad 33 → GPIO16
    pub const IO21: u16 = 33;
    /// U3 pad 34 → Net-(U3-Pad34)
    pub const RXD0_IO3: u16 = 34;
    /// U3 pad 35 → Net-(U3-Pad35)
    pub const TXD0_IO1: u16 = 35;
    /// U3 pad 36 → Net-(U3-Pad36)
    pub const IO22: u16 = 36;
    /// U3 pad 37 → Net-(U3-Pad37)
    pub const IO23: u16 = 37;
    /// U3 pad 38 → Net-(C4-Pad2)
    pub const GND_38: u16 = 38;
    /// U3 pad 39 → Net-(C4-Pad2)
    pub const GND_39: u16 = 39;
}

pub mod rails {
}

pub mod i2c {
}
