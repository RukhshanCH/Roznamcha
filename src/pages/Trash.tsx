import { Link } from "react-router-dom";
import TransactionTableTr from "@/components/ui/TransactionTableTr";

const Trash = () => {

    return (
        <div>
            <h1 className="page-title">ری سائیکل بن</h1>

            <div className="page-title-section">
                <div className="page-title-left">
                    <div className="breadcrumb">
                        <Link to="/dashboard">ڈیش بورڈ</Link>
                        {" / ری سائیکل بن"}
                    </div>
                </div>
            </div>

            <TransactionTableTr />
        </div>
    );
};

export default Trash;