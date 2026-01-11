package domain

type Property struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Type            string `json:"type"`
	GroupID         string `json:"group_id"`    // e.g. "1.1", "1.2"
	GroupName       string `json:"group_name"`  // e.g. "Cerro Navia"
	GroupColor      string `json:"group_color"` // e.g. "#3b82f6"
	Price           int    `json:"price"`
	RentBase        int    `json:"rent_base"`
	RentColorGroup  int    `json:"rent_color_group"`
	Rent1House      int    `json:"rent_1_house"`
	Rent2House      int    `json:"rent_2_house"`
	Rent3House      int    `json:"rent_3_house"`
	Rent4House      int    `json:"rent_4_house"`
	RentHotel       int    `json:"rent_hotel"`
	HouseCost       int    `json:"house_cost"`
	HotelCost       int    `json:"hotel_cost"`
	MortgageValue   int    `json:"mortgage_value"`
	UnmortgageValue int    `json:"unmortgage_value"`
}
